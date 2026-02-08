import { type Swap, SwapStatus } from '@prisma/client';
import { prisma } from './prisma';

export interface CreateSwapData {
  userWallet: string;
  destWallet: string;
  sourceChain: string;
  sourceToken: string;
  sourceAmount: string;
  destChain: string;
  destToken: string;
  destAmount: string;
  provider: string;
  providerId: string;
  quoteId?: string;
  userFeeToken: string;
  userFeeAmount: string;
  sponsorCostsSol: string;
  estimatedDuration?: number;
}

export interface UpdateSwapData {
  status?: SwapStatus;
  solanaSignature?: string;
  evmSignature?: string;
  errorMessage?: string;
  completedAt?: Date;
  actualDuration?: number;
}

export class SwapRepository {
  /**
   * Create a new swap record
   */
  async create(
    data: CreateSwapData,
    initialStatus: SwapStatus = SwapStatus.PENDING,
    id?: string,
  ): Promise<Swap> {
    return prisma.swap.create({
      data: {
        ...(id ? { id } : {}),
        ...data,
        status: initialStatus,
      },
    });
  }

  /**
   * Update a swap record
   */
  async update(id: string, data: UpdateSwapData): Promise<Swap> {
    return prisma.swap.update({
      where: { id },
      data,
    });
  }

  /**
   * Find swap by ID
   */
  async findById(id: string): Promise<Swap | null> {
    return prisma.swap.findUnique({
      where: { id },
    });
  }

  /**
   * Find swaps by user wallet
   */
  async findByUser(wallet: string, limit = 50): Promise<Swap[]> {
    return prisma.swap.findMany({
      where: { userWallet: wallet },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Find swaps by status
   */
  async findByStatus(status: SwapStatus): Promise<Swap[]> {
    return prisma.swap.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Update swap status
   */
  async updateStatus(
    id: string,
    status: SwapStatus,
    additionalData?: Partial<UpdateSwapData>,
  ): Promise<Swap> {
    const updateData: UpdateSwapData = { status, ...additionalData };

    // Set completedAt if status is COMPLETED
    if (status === SwapStatus.COMPLETED && !additionalData?.completedAt) {
      updateData.completedAt = new Date();

      // Calculate actual duration
      const swap = await this.findById(id);
      if (swap) {
        const duration = Math.floor(
          (updateData.completedAt.getTime() - swap.createdAt.getTime()) / 1000,
        );
        updateData.actualDuration = duration;
      }
    }

    return this.update(id, updateData);
  }

  /**
   * Get swap statistics
   */
  async getStats(userWallet?: string) {
    const where = userWallet ? { userWallet } : {};

    const [total, completed, failed, inProgress] = await Promise.all([
      prisma.swap.count({ where }),
      prisma.swap.count({ where: { ...where, status: SwapStatus.COMPLETED } }),
      prisma.swap.count({ where: { ...where, status: SwapStatus.FAILED } }),
      prisma.swap.count({
        where: {
          ...where,
          status: {
            in: [
              SwapStatus.PENDING,
              SwapStatus.BUILDING,
              SwapStatus.AWAITING_USER_SIG,
              SwapStatus.SUBMITTED,
              SwapStatus.BRIDGING,
            ],
          },
        },
      }),
    ]);

    return {
      total,
      completed,
      failed,
      inProgress,
      successRate: total > 0 ? (completed / total) * 100 : 0,
    };
  }
}

// Export singleton instance
export const swapRepository = new SwapRepository();
