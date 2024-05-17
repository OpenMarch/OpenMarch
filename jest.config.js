/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "jsdom",
  testEnvironmentOptions: {
    customExportConditions: ["react-native"],
    nodeOptions: "--experimental-vm-modules --loader=swc"
  },
  testPathIgnorePatterns: [
    // Ignore any files in the directory where Playwright tests are kept
    "<rootDir>/path/to/your/playwright/tests/",
    // Ignore specific file patterns
    "\\.spec\\.ts$",
  ],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  setupFilesAfterEnv: ["./setup-jest.ts"],
};
