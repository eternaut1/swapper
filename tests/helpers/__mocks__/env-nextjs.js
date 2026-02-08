// Mock @t3-oss/env-nextjs for Jest (ESM module can't be imported in CJS test env)
module.exports = {
  createEnv: (config) => {
    // Return a proxy that returns process.env values or defaults
    const env = {};
    if (config.server) {
      for (const [key, _schema] of Object.entries(config.server)) {
        env[key] = process.env[key] || undefined;
      }
    }
    if (config.client) {
      for (const [key, _schema] of Object.entries(config.client)) {
        env[key] = process.env[key] || undefined;
      }
    }
    return env;
  },
};
