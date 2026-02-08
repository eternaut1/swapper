import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { createRateLimiter, RateLimitTier } from './lib/middleware/rate-limiter';
import { logger } from './lib/utils/logger';

/**
 * Rate limit tiers based on actual API route paths
 */
const rateLimiter = createRateLimiter({
  tiers: {
    [RateLimitTier.STRICT]: {
      paths: ['/api/execute/confirm'],
      limit: 10,
      windowMs: 60000, // 10 per minute
    },
    [RateLimitTier.STANDARD]: {
      paths: ['/api/execute', '/api/quote'],
      limit: 60,
      windowMs: 60000, // 60 per minute
    },
    [RateLimitTier.RELAXED]: {
      paths: ['/api/status', '/api/history', '/api/balances', '/api/tokens'],
      limit: 100,
      windowMs: 60000, // 100 per minute
    },
    [RateLimitTier.UNLIMITED]: {
      paths: ['/api/health', '/api/init'],
      limit: 0,
      windowMs: 0,
    },
  },
  bypassPaths: ['/api/health', '/api/init', '/_next', '/favicon.ico'],
});

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip for static files and Next.js internals
  if (pathname.startsWith('/_next') || pathname.startsWith('/static') || pathname.includes('.')) {
    return NextResponse.next();
  }

  // Generate request ID for tracing
  const requestId = crypto.randomUUID();

  if (pathname.startsWith('/api')) {
    // Ensure app is initialized (skip for self-sufficient routes)
    if (
      !pathname.startsWith('/api/init') &&
      !pathname.startsWith('/api/balances') &&
      !pathname.startsWith('/api/health')
    ) {
      try {
        const port = process.env['PORT'] || '3000';
        const initUrl = `http://localhost:${port}/api/init`;
        await fetch(initUrl);
      } catch (error) {
        logger.error(
          'Failed to initialize app',
          error instanceof Error ? error : { error: String(error) },
        );
      }
    }

    // Apply rate limiting
    const rateLimitResult = await rateLimiter.check(request);

    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded', {
        requestId,
        path: pathname,
        ip: getClientIp(request),
      });

      return new NextResponse(
        JSON.stringify({
          success: false,
          error: 'Too many requests. Please try again later.',
          errorCode: 'RATE_LIMITED',
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-Request-ID': requestId,
            'X-RateLimit-Limit': rateLimitResult.limit.toString(),
            'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
            'X-RateLimit-Reset': rateLimitResult.reset.toISOString(),
            'Retry-After': rateLimitResult.retryAfter.toString(),
            ...getSecurityHeaders(),
          },
        },
      );
    }
  }

  // Continue to the route
  const response = NextResponse.next();

  // Add request ID and security headers
  response.headers.set('X-Request-ID', requestId);
  for (const [key, value] of Object.entries(getSecurityHeaders())) {
    response.headers.set(key, value);
  }

  return response;
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-real-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function getSecurityHeaders(): Record<string, string> {
  return {
    'X-DNS-Prefetch-Control': 'on',
    'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
    'X-Frame-Options': 'SAMEORIGIN',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
