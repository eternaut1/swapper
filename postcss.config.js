module.exports = {
  plugins: {
    '@stylexjs/postcss-plugin': {
      // Point to your source files that use StyleX
      include: [
        'app/**/*.{js,jsx,ts,tsx}',
        'components/**/*.{js,jsx,ts,tsx}',
        'hooks/**/*.{js,jsx,ts,tsx}',
        'styles/**/*.{js,jsx,ts,tsx}',
      ],
      // StyleX options
      unstable_moduleResolution: {
        type: 'commonJS',
        rootDir: __dirname,
      },
    },
  },
};
