const ReactDOM = require('react-dom')
const React = require('react')
const { ipcRenderer, shell } = electron = require('electron')
const { Provider, batch } = require('react-redux')
const { dialog } = electron.remote
const log = require('electron-log')
const THREE = require('three')
log.catchErrors()
const { createStore, applyMiddleware, compose } = require('redux')
const thunkMiddleware = require('redux-thunk').default
const { reducer } = require('../../shared/reducers/shot-generator')
const presetsStorage = require('../../shared/store/presetsStorage')
const { initialState } = require('../../shared/reducers/shot-generator')

const poses = require('../../shared/reducers/shot-generator-presets/poses.json')
const ShotExplorer = require('../../shot-explorer').default
const service = require('../shot-generator/service')
const loadBoardFromData = require('../../shared/actions/load-board-from-data')
const {loadAsset, cleanUpCache} = require("../../shot-generator/hooks/use-assets-manager")
const ModelLoader = require("./../../services/model-loader")
const {getFilePathForImages} = require("./../../shot-generator/helpers/get-filepath-for-images")
const {
  setBoard,
  loadScene,
  resetScene,
} = require('../../shared/reducers/shot-generator')

let sendedAction = []
let dialogShowed = false
let componentKey = THREE.Math.generateUUID()
let shotExplorerElement 
let isVisible = electron.remote.getCurrentWindow().visible
let defaultWidth = 400

ipcRenderer.on('shot-explorer:show', (event) => {
  isVisible = true;
  pushUpdates();
})
electron.remote.getCurrentWindow().on("hide", () => isVisible = false)

const actionSanitizer = action => (
    action.type === 'ATTACHMENTS_SUCCESS' && action.payload ?
    { ...action, payload: { ...action.payload, value: '<<DATA>>' } } : action
  )
  const stateSanitizer = state => state.attachments ? { ...state, attachments: '<<ATTACHMENTS>>' } : state
  const reduxDevtoolsExtensionOptions = {
    actionSanitizer,
    stateSanitizer,
    trace: true,
  }
  const composeEnhancers = (
      window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__ &&
      window.__REDUX_DEVTOOLS_EXTENSION_COMPOSE__(reduxDevtoolsExtensionOptions)
    ) || compose
  const configureStore = function configureStore (preloadedState) {
    const store = createStore(
      reducer,
      preloadedState,
      composeEnhancers(
        applyMiddleware(
            thunkMiddleware, store => next => action => {
              if(!isVisible) return 
              let indexOf = sendedAction.indexOf(action)
              if(action && indexOf === -1) {
                ipcRenderer.send("shot-generator:updateStore", action)
              } else if(indexOf !== -1) {
                sendedAction.splice(indexOf, 1)
              }
              next(action)
            })
      )
    )
    return store
  }


const store = configureStore({
  ...initialState,
  presets: {
    ...initialState.presets,
    scenes: {
      ...initialState.presets.scenes,
      ...presetsStorage.loadScenePresets().scenes
    },
    characters: {
      ...initialState.presets.characters,
      ...presetsStorage.loadCharacterPresets().characters
    },
    poses: {
      ...initialState.presets.poses,
      ...poses,
      ...presetsStorage.loadPosePresets().poses
    },
    handPoses: {
      ...initialState.presets.handPoses,
      ...presetsStorage.loadHandPosePresets().handPoses
    }
  },
})
const pushUpdates = () => {
  componentKey = THREE.Math.generateUUID()
  shotExplorerElement = renderShotExplorer()
  batch(() => {
    for(let i = 0; i < sendedAction.length; ) {
      store.dispatch(sendedAction[i])
    }
  })
  renderDom()
}
const showUpdateDialog = () => {
  if(dialogShowed) return
  let options = {
    type: 'info',
    buttons: ['Yes', 'No'],
    title: 'Confirm',
    message: 'The Shot Generator scene was changed. Do you want to update Shots?',
    defaultId: 0,
    focus: false
    
  }
  dialog.showMessageBox(electron.remote.getCurrentWindow(), options, (response) => {
    
    if(response === 0) pushUpdates()
    dialogShowed = false
  })
  dialogShowed = true
  electron.remote.getCurrentWindow().blur()
}

ipcRenderer.on("shot-explorer:updateStore", (event, action) => {
  sendedAction.push(action)
  if(isVisible) showUpdateDialog()
})



const loadBoard = async (board, storyboarderFilePath) => {
  log.info(board)

  let shot = board.sg
  let action = setBoard(board)
  sendedAction.push(action)
  store.dispatch(action)
  
  if (shot) {
    action = loadScene(shot.data)
    sendedAction.push(action)
    store.dispatch(action)
  } else {
    action = resetScene()
    sendedAction.push(action)
    store.dispatch(action)
  }
  
  
  if (!board.sg) {
    return false
  }

  //const { storyboarderFilePath } = await service.getStoryboarderFileData()
  const {sceneObjects, world} = board.sg.data

  await Object.values(sceneObjects)
  // has a value for model
  .filter(o => o.model != null)
  // is not a box
  .filter(o => !(o.type === 'object' && o.model === 'box'))
  // what's the filepath?
  .map((object) => ModelLoader.getFilepathForModel(object, { storyboarderFilePath }))
  // request the file
  .map(loadAsset)

  if (world.environment.file) {
    await loadAsset(
      ModelLoader.getFilepathForModel({
        model: world.environment.file,
        type: 'environment'
      }, { storyboarderFilePath })
    )
  }

  const paths = Object.values(sceneObjects)
  .filter(o => o.volumeImageAttachmentIds && o.volumeImageAttachmentIds.length > 0)
  .map((object) => getFilePathForImages(object, storyboarderFilePath))

  for(let i = 0; i < paths.length; i++) {
    if(!Array.isArray(paths[i])) {
      await loadAsset(paths[i])
    } else {
      for(let j = 0; j < paths[i].length; j++) {
        await loadAsset(paths[i][j])
      }
    }
  }
}

ipcRenderer.on("shot-generator:open:shot-explorer", async (event) => {
  const { storyboarderFilePath, boardData } = await service.getStoryboarderFileData()
  const { board } = await service.getStoryboarderState()
  let aspectRatio = parseFloat(boardData.aspectRatio)

  electron.remote.getCurrentWindow().setMaximumSize(Math.ceil(defaultWidth * aspectRatio), 100000)
  electron.remote.getCurrentWindow().setMinimumSize(Math.ceil(defaultWidth * aspectRatio), 800)

  let action  = {
    type: 'SET_META_STORYBOARDER_FILE_PATH',
    payload: storyboarderFilePath
  }
  sendedAction.push(action)
  store.dispatch(action)
  action = {
    type: 'SET_ASPECT_RATIO',
    payload: aspectRatio
  }
  sendedAction.push(action)
  store.dispatch(action)

  await loadBoard(board, storyboarderFilePath)
})

const renderShotExplorer = () => {
  console.log(componentKey)
  return <ShotExplorer 
                elementKey={ componentKey } 
                store={ store }
                defaultWidth={ defaultWidth }/>
}
shotExplorerElement = renderShotExplorer()


const renderDom = () => {
  ReactDOM.render(
    (store && <Provider store={ store }>
     { shotExplorerElement }
    </Provider> ),
  document.getElementById('main')
    )
}
renderDom()
