const { test, _electron: electron } = require('@playwright/test')

// TODO - implement e2e tests

test('launch app', async () => {
    return;
    const electronApp = await electron.launch({ args: ['electron/main/index.ts'] })
    // close app
    await electronApp.close()
})

test('get isPackaged', async () => {
    return;
    const electronApp = await electron.launch({ args: ['electron/main/index.ts'] })
    const isPackaged = await electronApp.evaluate(async ({ app }) => {
        // This runs in Electron's main process, parameter here is always
        // the result of the require('electron') in the main app script.
        return app.isPackaged
    })
    console.log(isPackaged) // false (because we're in development mode)
    // close app
    await electronApp.close()
})

