// Mock @t3-oss/env-core for Jest
module.exports = {
  createEnv: (config) => {
    const env = {};
    if (config.server) {
      for (const [key, _schema] of Object.entries(config.server)) {
        env[key] = process.env[key] || undefined;
      }
    }
    return env;
  },
};
