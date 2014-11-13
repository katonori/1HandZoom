const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/PrivateBrowsingUtils.jsm');

//const DEBUG = false; // If false, the debug() function does nothing.
const DEBUG = true; // If false, the debug() function does nothing.

//===========================================
// QuickGestures2
//===========================================
let QuickGestures2 = {
    install: function() {
        //debug('install()');
    },

    uninstall: function() {
        //debug('uninstall()');
    },

    _setupDefaultPrefs: function() {
        //debug('_setupDefaultPrefs()');

        let branch = Services.prefs.getDefaultBranch('extensions.quickgestures2.');
        branch.setBoolPref('layer.visible', true);
        branch.setBoolPref('toast.visible', true);
        branch.setIntPref('threshold.angle', 60);  // Threshold degree (10 ~ 80)
        branch.setIntPref('threshold.splits', 16);  // Division number of screen width (2 ~ 16)
        branch.setIntPref('threshold.timeout', 1500);  // Gesture timeout (millisecond)
        branch.setIntPref('threshold.interval', 80);  // Time to avoid unintended input (millisecond)
        branch.setCharPref('mapk2g', JSON.stringify(this._mapK2G));
    },

    _updateThreshold: function() {

        let interval = this._branch.getIntPref('threshold.interval');
        if (interval < 0 || interval > 200) {
            interval = (interval < 0) ? 0 : 200;
            this._changePref = true;
            this._branch.setIntPref('threshold.interval', interval);
        }
 
        let timeout = this._branch.getIntPref('threshold.timeout');
        if (timeout < 50 || timeout > 10000) {
            timeout = (timeout < 50) ? 50 : 10000;
            this._changePref = true;
            this._branch.setIntPref('threshold.timeout', timeout);
        }
 
        let splits = this._branch.getIntPref('threshold.splits');
        if (splits < 2 || splits > 16) {
            splits = (splits < 2) ? 2 : 16;
            this._changePref = true;
            this._branch.setIntPref('threshold.splits', splits);
        }
        this._splits = splits * 2;

        let angle = this._branch.getIntPref('threshold.angle');
        if (angle < 10 || angle > 80) {
            angle = (angle < 10) ? 10 : 80;
            this._changePref = true;
            this._branch.setIntPref('threshold.angle', angle);
        }

        this._ratio1 = Math.tan(Math.PI * angle / 360);
        this._ratio2 = Math.tan(Math.PI * (180 - angle) / 360);
    },

    init: function() {
        debug('init()');

        const firefoxApp = Cc['@mozilla.org/xre/app-info;1'].getService(Ci.nsIXULAppInfo);
        this._firefoxVersion = parseInt(firefoxApp.version);

        this._branch = null;
        this._setupDefaultMapping();
        this._setupDefaultPrefs();

        if (!this._branch) {
            this._branch = Services.prefs.getBranch('extensions.quickgestures2.');

            this._updateThreshold();
            this._updateMapping();

            this._branch.addObserver('', this, false);
        }
    },

    uninit: function() {
        //debug('uninit()');

        if (this._branch) {
            this._branch.removeObserver('', this);
            this._branch = null;
        }
    },

    _menuIdZoomIn: null,
    _menuIdZoomOut: null,

    load: function(aWindow) {
        //debug('load(' + aWindow + ')');

        if (!aWindow)
            return;

        let deck = aWindow.BrowserApp.deck;
        deck.addEventListener('touchstart', this, true);
        deck.addEventListener('touchmove', this, true);
        deck.addEventListener('touchend', this, true);

        // add menu
        this._menuIdZoomIn = aWindow.NativeWindow.menu.add("Zoom In", null, this._cbZoomIn);
        this._menuIdZoomOut = aWindow.NativeWindow.menu.add("Zoom Out", null, this._cbZoomOut);
    },

    _cbZoomIn: function() {
        zoomIn();
    },
    _cbZoomOut: function() {
        zoomOut();
    },

    unload: function(aWindow) {
        //debug('unload(' + aWindow + ')');

        if (!aWindow)
            return;

        aWindow.NativeWindow.menu.remove(this._menuIdZoomIn);
        aWindow.NativeWindow.menu.remove(this._menuIdZoomOut);

        let deck = aWindow.BrowserApp.deck;
        deck.removeEventListener('touchstart', this, true);
        deck.removeEventListener('touchmove', this, true);
        deck.removeEventListener('touchend', this, true);
    },

    observe: function(aSubject, aTopic, aData) {
        debug('observe(' + aSubject + ', ' + aTopic + ', ' + aData + ')');

        if (this._changePref) {
            this._changePref = false;
            return;
        }

        switch (aData) {
            case 'mapk2g':
                this._updateMapping();
                break;

            case 'threshold.angle':
            case 'threshold.splits':
            case 'threshold.timeout':
                this._updateThreshold();
                break;
        }
    },

    handleEvent: function(aEvent) {
        let fingers = null;
        let selectedTab = getSelectedTab();
        let window = selectedTab.window;

        switch (aEvent.type) {
            case 'touchstart':
                fingers = aEvent.touches.length;
                if (fingers != 1)
                    break;

                this._startStroke(aEvent);
                break;

            case 'touchmove':
                fingers = aEvent.touches.length;
                if (fingers != 1)
                    break;

                this._progressStroke(aEvent);

                if (this._shouldStopPanning) {
                    // Stop events derived from a website
                    aEvent.stopPropagation();

                    // Stop panning event
                    sendMessageToJava({ gecko: { type:'Panning:Override' } });
                }
                break;

            case 'touchend':
                fingers = aEvent.touches.length;
                if (fingers != 0)
                    break;

                this._stopStroke(aEvent);
                break;
        }
    },

    _startStroke: function(aEvent) {
        //debug('_startStroke(' + aEvent + ')');
        const touch = aEvent.touches.item(0);
        this._chromeWindow = Services.wm.getMostRecentWindow('navigator:browser');
        this._selectedTab = this._chromeWindow.BrowserApp.selectedTab;
        this._contentWindow = this._selectedTab.browser.contentWindow;

        const cWin = this._contentWindow;
        //const docW = this._selectedTab.window.document.documentElement.clientWidth;
        const docW = cWin.innerWidth;
        const docH = this._selectedTab.window.document.documentElement.clientHeight;
        const range = docW * 0.85;
        if(touch.screenX < range) {
            this._cancelStroke(aEvent);
            return;
        }

        const viewport = this._selectedTab.getViewport();
        const w = viewport.cssWidth;
        const h = viewport.cssHeight;

        this._threshold = Math.round( (w < h ? w : h) / this._splits);

        this._lastX = touch.screenX;
        this._lastY = touch.screenY;
        this._gesture = '';
        this._inProgress = true;
        this._updateViewportCount = 0;
        this._shouldStopPanning = false;
        this._lastDirection = '';
        this._lastDetTime = (new Date()).getTime();

        //this._prepareLayer(aEvent.view.document, viewport);
        this._prepareLayer(this._selectedTab.window.document, viewport);
    },

    _progressStroke: function(aEvent) {
        //debug('_progressStroke(' + aEvent.type + ')');
        const touch = aEvent.touches.item(0);
        const cWin = this._contentWindow;
        //const docW = this._selectedTab.window.document.documentElement.clientWidth;
        const docW = cWin.innerWidth;
        const docH = this._selectedTab.window.document.documentElement.clientHeight;
        const range = docW * 0.85;
        if(touch.screenX < range) {
            this._cancelStroke(aEvent);
            return;
        }

        if (!this._inProgress)
            return;

        // Only Firefox 22 causes trembling scroll behavior.
        // Skipping this viewport update process, the buggy behavior calms down,
        // but the gesture recognition becomes worse.
        // The behavior may be attributed to firefox's internal changes
        // because it doesn't reproduce except for Firefox 22.
        // This solution is a kludge, which might give inconvenience
        // to Firefox 22 users. 
        if (this._firefoxVersion > 22) {
            // The viewport update cycle will be called once every
            // three times because the update is a heavy process and
            // 'touchmove' events are frequently called for a moment.
            if (!this._shouldStopPanning
                && this._updateViewportCount++ > 2) {

                this._updateViewportCount = 0;
                this._selectedTab.sendViewportUpdate(true);
            }
        }

        //this._displayDebugInfo(touch);

        const x = touch.screenX;
        const y = touch.screenY;
        const subX = x - this._lastX;
        const subY = y - this._lastY;
        const deltaX = Math.abs(subX);
        const deltaY = Math.abs(subY);
        var w = this._selectedTab.window.document.documentElement.clientWidth;
        var h = this._selectedTab.window.document.documentElement.clientHeight;
        debug("x, y: w, h: " + x + "," + y + "," + w + "," + h + "," + cWin.innerHeight);
        debug("cx, cy: " + touch.clientX + "," + touch.clientY);

        if (deltaX < this._threshold && deltaY < this._threshold)
            return;

        this._restartTimer();

        let direction;
        if (deltaX > deltaY)
            direction = (subX<0 ? 'L' : 'R');
        else
            direction = (subY<0 ? 'U' : 'D');

        this._lastX = x;
        this._lastY = y;

        // Ongoing gesture command will be cancelled when a user
        // drawed a diagonal gesture twice in quick succession,
        // ratio: tan(15deg) < (deltaY/deltaX) < tan(75deg) : if angle == 30;
        const ratio = deltaY / deltaX;
        if (ratio > this._ratio1 && ratio < this._ratio2) {
            if (this._lastDirection == '*') {
                this._inProgress = false;
                this._shouldStopPanning = false;
                this._displayLayer();
            } else {
                this._lastDirection = '*';
            }
            return;
        }

        if (direction != this._lastDirection) {
            if (!this._shouldStopPanning
                && this._gesture.length > 1
                && !(direction + this._lastDirection).match(/UD|DU|LR|RL/)
                && !this._gesture.match(/^[UD]+$/)
                && !this._gesture.match(/^[LR]+$/)) {

                this._shouldStopPanning = true;
            }

            this._lastDirection = direction;
            return;
        }

        this._lastDirection = direction;

        if (direction == this._gesture.slice(-1))
            return;

        this._gesture += direction;
        this._lastDetTime = (new Date()).getTime();

        if (this._gesture.length > 1) {
            this._displayLayer();

            if (!this._shouldStopPanning
                && !this._gesture.match(/^[UD]+$/)
                && !this._gesture.match(/^[LR]+$/)) {

                this._shouldStopPanning = true;
            }
        }
    },

    _cancelStroke: function(aEvent) {
        this._inProgress = false;
        this._stopStroke(aEvent);
    },

    _stopStroke: function(aEvent) {
        debug('_stopStroke(' + aEvent + ')');
        if (this._inProgress) {

            debug("inProgress");
            // To avoid unintended input for too quick gesture
            const currentTime = (new Date()).getTime();
            const interval = this._branch.getIntPref('threshold.interval')
            //debug('interval('+ interval + '): ' + (currentTime - this._lastDetTime));
            if (currentTime - this._lastDetTime < interval) {
                this._gesture = this._gesture.slice(0, -1);
            }

            debug("command:" + this._gesture);
            for(i in this._mapG2C) {
                debug("M: " + i);
            }
            if (this._gesture
                && this._gesture in this._mapG2C) {

                let command = this._mapG2C[this._gesture];

                try {
                    debug("runCallback:" + this._gesture);
                    let message = command.callback(this._chromeWindow);

                    if (message && this._branch.getBoolPref('toast.visible'))
                        showToast(this._chromeWindow, message);

                } catch (ex) {
                    let error_message = 'Error: ' + ex;
                    showToast(this._chromeWindow, error_message);
                    //debug(error_message);
                }
            }

        }

        this._hideLayer();
        this._clearTimer();
        this._gesture = '';
        this._inProgress = false;
    },

    // Display coordination info for debug on the this._layer
    _displayDebugInfo: function(aTouch) {
        const cWin = this._contentWindow;
        const vp = this._selectedTab.getViewport();

        let msg = [];
        msg.push(this._gesture);
        msg.push('v.zoom('+ vp.zoom + ')');
        msg.push('v.xy('+ vp.x +', '+ vp.y + ')');
        msg.push('v.cssXY('+ vp.cssX +', '+ vp.cssY +')');
        msg.push('v.pageLTRB('+ vp.pageLeft +', '+ vp.pageTop +', '+ vp.pageRight +', '+ vp.pageBottom +')');
        msg.push('v.cssLTRB('+ vp.cssPageLeft +', '+ vp.cssPageTop +', '+ vp.cssPageRight +', '+ vp.cssPageBottom +')');
        msg.push('v.WH('+ vp.width +', '+ vp.height +')');
        msg.push('v.cssWH('+ vp.cssWidth +', '+ vp.cssHeight +')');
        msg.push('w.outerWH('+ cWin.outerWidth +', '+ cWin.outerHeight +')');
        msg.push('w.innerWH('+ cWin.innerWidth +', '+ cWin.innerHeight +')');
        msg.push('w.scrollXY('+ cWin.scrollX +', '+ cWin.scrollY +')');
        msg.push('t.clientXY('+ aTouch.clientX +', '+ aTouch.clientY +')');
        msg.push('t.screenXY('+ aTouch.screenX +', '+ aTouch.screenY +')');
        msg.push('t.pageXY('+ aTouch.pageX +', '+ aTouch.pageY +')');

        if (this._layer) {
            this._layer.innerHTML = msg.join('<br />');
            this._layer.style.visibility = 'visible';
            this._layer.style.height = 'auto';
        }
    },

    _prepareLayer: function(aDocument, aViewport) {
        //debug('_prepareLayer('+ aDocument + ',' + aViewport + ')');

        if (!aDocument.body || !this._branch.getBoolPref('layer.visible')) {
            this._layer = null;
            return;
        }

        let layer = aDocument.getElementById('quickgestures-layer');
        if (!layer) {
            layer = aDocument.createElement('div');
            layer.id = 'quickgestures-layer';

            layer.style.display = 'inline';
            layer.style.position = 'fixed';
            layer.style.top = '-2px';
            layer.style.left = '0';
            layer.style.zIndex = 0x7FFFFFFF;
            layer.style.padding = '5px 4px 3px 4px';
            layer.style.borderBottom = 'solid 1px #aaa';
            layer.style.visibility = 'hidden';
            layer.style.backgroundColor = '#eee';
            layer.style.color = '#333';
            layer.style.textAlign = 'center';
            layer.style.verticalAlign = 'middle';
            layer.style.fontFamily = 'Roboto,sans-serif';

            try {
                aDocument.body.appendChild(layer);
            } catch (ex) {
                this._layer = null;
                return;
            }
        }

        const width = Math.round(aViewport.cssWidth);
        const height = Math.round(aViewport.cssHeight / 25);

        layer.style.width = width + 'px';
        layer.style.height = height + 'px';
        layer.style.fontSize = Math.round(height * 0.90) + 'px';

        while (layer.firstChild)
            layer.removeChild(layer.firstChild);
        
        layer.appendChild(aDocument.createTextNode(''));
        this._layer = layer;
    },

    _displayLayer: function() {
        //debug('_displayLayer()');

        if (!this._layer)
            return;

        let text;
        let doc = this._layer.ownerDocument;
        while (this._layer.firstChild)
            this._layer.removeChild(this._layer.firstChild);

        if (this._inProgress) {
            if (this._gesture in this._mapG2C) {
                this._layer.style.backgroundColor = '#33B5E5';
                let command = this._mapG2C[this._gesture];
                text = this._gesture + ' (' + tr(command.name) + ')';
            } else {
                this._layer.style.backgroundColor = '#eee';
                text = this._gesture;
            }
        } else {
            this._layer.style.backgroundColor = '#FFBB33';
            text = tr('Cancel_Msg');
        }

        this._layer.style.visibility = 'visible';
        this._layer.appendChild(doc.createTextNode(text));
    },

    _hideLayer: function() {
        //debug('_hideLayer()');

        if (!this._layer)
            return;

        this._layer.style.visibility = 'hidden';
    },

    _restartTimer: function() {
        this._clearTimer();

        const timeout_msec = this._branch.getIntPref('threshold.timeout');

        this._timerID = this._contentWindow.setTimeout(function(self) {
            self._inProgress = false;
            self._shouldStopPanning = false;
            self._displayLayer();
            //debug('gesture timeout: ' + self._timerID);
        }, timeout_msec, this);

        //debug('setTimeout: ' + this._timerID);
    },

    _clearTimer: function() {
        if (this._timerID) {
            this._contentWindow.clearTimeout(this._timerID);
            //debug('clearTimeout: ' + this._timerID);
        }
        this._timerID = null;
    },

    _setupDefaultMapping: function() {
        debug('_setupDefaultMapping()');

        this._mapG2C = {};  // {gesture:command, ...}
        this._mapK2G = {};  // {commandKey:gesture, ...}

        for (let commandKey in this._commands) {
            let command = this._commands[commandKey];

            this._mapK2G[commandKey] = command.defaultGesture;

            if (command.defaultGesture) {
                debug("setting: " + command.defaultGesture);
                command.name = tr(commandKey);
                command.gesture = command.defaultGesture;
                this._mapG2C[command.gesture] = command;
                debug("setting: done: " + command.defaultGesture);
            }
        }
    },

    _updateMapping: function() {
        //debug('_updateMapping()');
        
        return; // disabled

        if (!this._branch)
            return;

        let refresh = false;
        let mapk2g_json = this._branch.getCharPref('mapk2g');
        let userMapK2G;

        try {
            userMapK2G = JSON.parse(mapk2g_json);
        } catch (ex) {
            debug('Failed to parse the mapk2g_json');
            this._changePref = true;
            this._branch.clearUserPref('mapk2g');
            let mapk2g_json = this._branch.getCharPref('mapk2g');
            userMapK2G = JSON.parse(mapk2g_json);
        }

        this._mapG2C = {};  // {gesture:command, ...}

        for (let commandKey in this._commands) {
            debug("commandKey: " + commandKey);
            let command = this._commands[commandKey];
            let gesture = '';

            if (commandKey in userMapK2G) {
                gesture = userMapK2G[commandKey];
            } else {
                // When a new command added by addon's update
                debug('New command found: ' + commandKey);
                refresh = true;
            }

            // Reset to blank gesture mapk2g if it includes an invalid sequence
            if (gesture.length == 1 || (gesture && !gesture.match(/^[UDLR]+$/))) {
                debug('Invalid gesture found:' + gesture);
                refresh = true;
                gesture = '';
            }

            this._mapK2G[commandKey] = gesture;

            if (gesture) {
                command.name = tr(commandKey);
                command.gesture = gesture;
                debug("updating: " + command.defaultGesture);
                this._mapG2C[command.gesture] = command;
                debug("updating: done: " + command.defaultGesture);
            }
        }

        if (refresh) {
            this._changePref = true;
            this._branch.setCharPref('mapk2g', JSON.stringify(this._mapK2G));
        }
    },

    _commands: {
        'ZoomIn': {
            defaultGesture: 'D',
            callback: function(aWindow) {
                debug("D");
                zoomIn();
                return tr('ZoomIn');
            }
        },
        'ZoomOut': {
            defaultGesture: 'U',
            callback: function(aWindow) {
                debug("U");
                zoomOut();
                return tr('ZoomOut');
            }
        },
    },

};

//===========================================
// bootstrap.js API
//===========================================
function install(aData, aReason) {
    //QuickGestures2.install();
}

function uninstall(aData, aReason) {
    //if (aReason == ADDON_UNINSTALL)
        //QuickGestures2.uninstall();
}

function startup(aData, aReason) {
    // General setup
    QuickGestures2.init();

    // Load into any existing windows
    let windows = Services.wm.getEnumerator('navigator:browser');
    while (windows.hasMoreElements()) {
        let win = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
        if (win)
            QuickGestures2.load(win);
    }

    // Load into any new windows
    Services.wm.addListener(windowListener);
}

function shutdown(aData, aReason) {
    // When the application is shutting down we normally don't have to clean
    // up any UI changes made
    if (aReason == APP_SHUTDOWN)
        return;

    // Stop listening for new windows
    Services.wm.removeListener(windowListener);

    // Unload from any existing windows
    let windows = Services.wm.getEnumerator('navigator:browser');
    while (windows.hasMoreElements()) {
        let win = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
        if (win)
            QuickGestures2.unload(win);
    }

    // General teardown
    QuickGestures2.uninit();
}

let windowListener = {
    onOpenWindow: function(aWindow) {
        let win = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIDOMWindowInternal
                                                || Ci.nsIDOMWindow);

        win.addEventListener('UIReady', function() {
            win.removeEventListener('UIReady', arguments.callee, false);
            QuickGestures2.load(win);
        }, false);
    },

    // Unused
    onCloseWindow: function(aWindow) {},
    onWindowTitleChange: function(aWindow, aTitle) {},
};


//===========================================
// Utilities
//===========================================
function alert(aMsg) {
    Services.prompt.alert(null, "My Add-on", aMsg);
}

function debug(aMsg) {
    if (!DEBUG) return;
    aMsg = 'QuickGestures2: ' + aMsg;
    Services.console.logStringMessage(aMsg);
}

function showToast(aWindow, aMsg) {
    if (!aMsg) return;
    aWindow.NativeWindow.toast.show(aMsg, 'short');
}

function sendMessageToJava(aMessage) {
    let bridge = Cc['@mozilla.org/android/bridge;1'].getService(Ci.nsIAndroidBridge);
    return bridge.handleGeckoMessage(JSON.stringify(aMessage));
}

function getExistingTab(aUrl, aTabs) {
    let tab;
    for (let i=0; i < aTabs.length; i++) {
        tab = aTabs[i];
        if (tab.window.location == aUrl)
            return tab;
    }
    return null;
}

function getSelectedTab() {
    let chromeWindow = Services.wm.getMostRecentWindow('navigator:browser');
    let selectedTab = chromeWindow.BrowserApp.selectedTab;
    return selectedTab;
}

function zoomIn() {
    let chromeWindow = Services.wm.getMostRecentWindow('navigator:browser');
    let selectedTab = chromeWindow.BrowserApp.selectedTab;
    let window = selectedTab.window;
    vp = selectedTab.getViewport();
    vp.zoom = vp.zoom+0.2;
    debug("ZoomIn: " + vp.zoom + "," + selectedTab._zoom + "," + selectedTab._drawZoom);
    selectedTab.setViewport(vp);
    selectedTab.sendViewportUpdate();
}

function zoomOut() {
    let chromeWindow = Services.wm.getMostRecentWindow('navigator:browser');
    let selectedTab = chromeWindow.BrowserApp.selectedTab;
    let window = selectedTab.window;
    vp = selectedTab.getViewport();
    vp.zoom = vp.zoom-0.2;
    debug("ZoomOut: " + vp.zoom + "," + selectedTab._zoom + "," + selectedTab._drawZoom);
    selectedTab.setViewport(vp);
    selectedTab.sendViewportUpdate();
}

let gStringBundle = null;

function tr(aName) {
    // For translation
    if (!gStringBundle) {
        let uri = 'chrome://quickgestures2/locale/main.properties';
        gStringBundle = Services.strings.createBundle(uri);
    }

    try {
        return gStringBundle.GetStringFromName(aName);
    } catch (ex) {
        return aName;
    }
}

