import { Marcher, NewMarcher, NewPage, Page, UpdateMarcher, UpdateMarcherPage, UpdatePage } from "@/Interfaces"
import { contextBridge, ipcRenderer } from "electron"
import context from "react-bootstrap/esm/AccordionContext"
import { lstat } from 'node:fs/promises'


function domReady(condition: DocumentReadyState[] = ['complete', 'interactive']) {
  return new Promise(resolve => {
    if (condition.includes(document.readyState)) {
      resolve(true)
    } else {
      document.addEventListener('readystatechange', () => {
        if (condition.includes(document.readyState)) {
          resolve(true)
        }
      })
    }
  })
}

const safeDOM = {
  append(parent: HTMLElement, child: HTMLElement) {
    if (!Array.from(parent.children).find(e => e === child)) {
      return parent.appendChild(child)
    }
  },
  remove(parent: HTMLElement, child: HTMLElement) {
    if (Array.from(parent.children).find(e => e === child)) {
      return parent.removeChild(child)
    }
  },
}

/**
 * https://tobiasahlin.com/spinkit
 * https://connoratherton.com/loaders
 * https://projects.lukehaas.me/css-loaders
 * https://matejkustec.github.io/SpinThatShit
 */
function useLoading() {
  const className = `loaders-css__square-spin`
  const styleContent = `
@keyframes square-spin {
  25% { transform: perspective(100px) rotateX(180deg) rotateY(0); }
  50% { transform: perspective(100px) rotateX(180deg) rotateY(180deg); }
  75% { transform: perspective(100px) rotateX(0) rotateY(180deg); }
  100% { transform: perspective(100px) rotateX(0) rotateY(0); }
}
.${className} > div {
  animation-fill-mode: both;
  width: 50px;
  height: 50px;
  background: #fff;
  animation: square-spin 3s 0s cubic-bezier(0.09, 0.57, 0.49, 0.9) infinite;
}
.app-loading-wrap {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #282c34;
  z-index: 9;
}
    `
  const oStyle = document.createElement('style')
  const oDiv = document.createElement('div')

  oStyle.id = 'app-loading-style'
  oStyle.innerHTML = styleContent
  oDiv.className = 'app-loading-wrap'
  oDiv.innerHTML = `<div class="${className}"><div></div></div>`

  return {
    appendLoading() {
      safeDOM.append(document.head, oStyle)
      safeDOM.append(document.body, oDiv)
    },
    removeLoading() {
      safeDOM.remove(document.head, oStyle)
      safeDOM.remove(document.body, oDiv)
    },
  }
}

// ----------------------------------------------------------------------

const { appendLoading, removeLoading } = useLoading()
domReady().then(appendLoading)

window.onmessage = (ev) => {
  ev.data.payload === 'removeLoading' && removeLoading()
}

setTimeout(removeLoading, 4999)

// ----------------------------------------------------------------------

const APP_API = {
  // Database
  databaseIsReady: () => ipcRenderer.invoke('database:isReady'),
  databaseSave: () => ipcRenderer.invoke('database:save'),
  databaseLoad: () => ipcRenderer.invoke('database:load'),
  databaseCreate: () => ipcRenderer.invoke('database:create'),

  // Triggers
  onFetch: (callback: any) => ipcRenderer.on('fetch:all', (event, type) => callback(type)),
  removeFetchListener: () => ipcRenderer.removeAllListeners('fetch:all'),
  setSelectedPage: (selectedPageId: number) => ipcRenderer.send('get:selectedPage', (selectedPageId)),

  // History
  /** Activates on undo or redo. */
  onHistoryAction: (callback: any) => ipcRenderer.on('history:action', (event, args) => callback(args)),
  removeHistoryActionListener: () => ipcRenderer.removeAllListeners('history:action'),
  undo: () => ipcRenderer.invoke('history:undo'),
  redo: () => ipcRenderer.invoke('history:redo'),

  // Marcher
  getMarchers: () => ipcRenderer.invoke('marcher:getAll'),
  createMarcher: (marcher: NewMarcher) => ipcRenderer.invoke('marcher:insert', marcher),
  updateMarchers: (args: UpdateMarcher[]) => ipcRenderer.invoke('marcher:update', args),
  deleteMarcher: (id: number) => ipcRenderer.invoke('marcher:delete', id),

  // Page
  getPages: () => ipcRenderer.invoke('page:getAll'),
  createPages: (pages: NewPage[]) => ipcRenderer.invoke('page:insert', pages),
  updatePages: (args: UpdatePage[]) => ipcRenderer.invoke('page:update', args),
  deletePage: (id: number) => ipcRenderer.invoke('page:delete', id),

  // MarcherPage
  getMarcherPages: (args: { marcher_id?: number, page_id?: number }) => ipcRenderer.invoke('marcher_page:getAll'),
  getMarcherPage: (id: { marcher_id: number, page_id: number }) => ipcRenderer.invoke('marcher_page:get', id),
  updateMarcherPage: (args: UpdateMarcherPage) => ipcRenderer.invoke('marcher_page:update', args),
}

contextBridge.exposeInMainWorld('electron', APP_API)

// TODO, figure out how to send message to renderer
// const HISTORY_API = {
//   undo: () => ipcRenderer.invoke('history:undo'),
// }

export type ElectronApi = typeof APP_API;
