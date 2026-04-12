/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testMatch: ['**/src/test/integration/**/*.int.test.ts'],
  setupFilesAfterEnv: ['<rootDir>/src/test/integration/jest-integration-setup.ts'],
};
