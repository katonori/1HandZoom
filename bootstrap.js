// vim: set sw=4 expandtab:
const Ci = Components.interfaces;
const Cu = Components.utils;
Cu.import("resource://gre/modules/Services.jsm");

const DEBUG = false; // If false, the debug() function does nothing.
//const DEBUG = true; // If false, the debug() function does nothing.
const SPLIT_MIN = 2;
const SPLIT_MAX = 128;
const ZOOM_STEP_MIN = 1;
const ZOOM_STEP_MAX = 100;
const GESTURE_VALID_RANGE_RATIO = 0.9;
const ZOOM_IN_MAX = 10.0;
const ZOOM_OUT_MIN = 0.5;

let windowListener = {
    onOpenWindow: function(aWindow) {
        let win = aWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                         .getInterface(Ci.nsIDOMWindowInternal
                                                || Ci.nsIDOMWindow);

        win.addEventListener('UIReady', function() {
            win.removeEventListener('UIReady', arguments.callee, false);
            OneHandZoom.load(win);
        }, false);
    },

    // Unused
    onCloseWindow: function(aWindow) {},
    onWindowTitleChange: function(aWindow, aTitle) {},
};

//===========================================
// OneHandZoom
//===========================================
let OneHandZoom = {
    install: function() {
        debug('install()');
    },

    uninstall: function() {
        debug('uninstall()');
    },

    _setupDefaultPrefs: function() {
        debug('_setupDefaultPrefs()');

        let branch = Services.prefs.getDefaultBranch('extensions.onehandzoom.');
        branch.setIntPref('gestureSplits', 32);  // Division number of screen width (2 ~ 16)
        branch.setIntPref('zoomStep', 5);  // actual_zoom_step = zoomStep/100
    },

    _updateThresholdSub: function(name, min, max) {
        let val = this._branch.getIntPref(name);
        if (val < min || val > max) {
            val = (val < min) ? min : max;
            this._changePref = true;
            this._branch.setIntPref(name, val);
        }
    },

    _updateThreshold: function() {
        this._updateThresholdSub('gestureSplits', SPLIT_MIN, SPLIT_MAX);
        this._updateThresholdSub('zoomStep', ZOOM_STEP_MIN, ZOOM_STEP_MAX);
        this._splits = this._branch.getIntPref('gestureSplits');
        this._zoomStep = this._branch.getIntPref('zoomStep')/100.0;
    },

    init: function() {
        debug('init()');

        this._branch = null;
        this._setupDefaultPrefs();

        if (!this._branch) {
            this._branch = Services.prefs.getBranch('extensions.onehandzoom.');
            this._updateThreshold();
            this._branch.addObserver('', this, false);
        }
    },

    uninit: function() {
        debug('uninit()');

        if (this._branch) {
            this._branch.removeObserver('', this);
            this._branch = null;
        }
    },

    _menuIdZoomIn: null,
    _menuIdZoomOut: null,

    load: function(aWindow) {
        debug('load(' + aWindow + ')');

        if (!aWindow)
            return;

        let deck = aWindow.BrowserApp.deck;
        deck.addEventListener('load', this, true);
        deck.addEventListener('touchstart', this, true);
        deck.addEventListener('touchmove', this, true);
        deck.addEventListener('touchend', this, true);

        // add menu
        //this._menuIdZoomIn = aWindow.NativeWindow.menu.add("Zoom In", null, this._cbZoomIn);
        //this._menuIdZoomOut = aWindow.NativeWindow.menu.add("Zoom Out", null, this._cbZoomOut);
    },

    /*
    _cbZoomIn: function() {
        zoomIn(this._zoomStep));
    },
    _cbZoomOut: function() {
        zoomOut(this._zoomStep));
    },
    */

    unload: function(aWindow) {
        debug('unload(' + aWindow + ')');

        if (!aWindow)
            return;

        //aWindow.NativeWindow.menu.remove(this._menuIdZoomIn);
        //aWindow.NativeWindow.menu.remove(this._menuIdZoomOut);

        let deck = aWindow.BrowserApp.deck;
        deck.removeEventListener('load', this, true);
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
        case 'gestureSplits':
        case 'zoomStep':
            this._updateThreshold();
            break;
        }
    },

    handleEvent: function(aEvent) {
        let fingers = null;
        let tab = getSelectedTab();

        switch (aEvent.type) {
        case 'load':
            // clear current zoom status
            tab._currentZoom = 1.0;
            break;
        case 'touchstart':
            this._startStroke(aEvent);
            break;
        case 'touchmove':
            this._progressStroke(aEvent);
            break;
        case 'touchend':
            fingers = aEvent.touches.length;
            if (fingers != 0) {
                break;
            }
            this._stopStroke(aEvent);
            break;
        }
    },

    _startStroke: function(aEvent) {
        debug('_startStroke(' + aEvent + ')');
        const touch = aEvent.touches.item(0);
        this._chromeWindow = getChromeWindow();
        this._selectedTab = this._chromeWindow.BrowserApp.selectedTab;
        this._contentWindow = this._selectedTab.browser.contentWindow;

        const range = this._contentWindow.innerWidth * GESTURE_VALID_RANGE_RATIO;
        if(touch.screenX < range) {
            // touches in this area is ignored
            this._cancelStroke(aEvent);
            return;
        }

        const viewport = this._selectedTab.getViewport();
        const cssh = viewport.cssHeight;

        this._threshold = Math.round(cssh/this._splits);

        this._startY = touch.screenY;
        this._inProgress = true;
    },

    _progressStroke: function(aEvent) {
        const touch = aEvent.touches.item(0);
        const contentWindow = this._contentWindow;
        const innerWidth = contentWindow.innerWidth;
        const range = innerWidth * GESTURE_VALID_RANGE_RATIO;
        if(touch.screenX < range) {
            // touches in this area is ignored
            this._cancelStroke(aEvent);
            return;
        }
        aEvent.preventDefault(); // discard the event

        if (!this._inProgress)
            return;

        const x = touch.screenX;
        const y = touch.screenY;
        const viewport = this._selectedTab.getViewport();
        const cssh = viewport.cssHeight;
        let w = this._selectedTab.window.document.documentElement.clientWidth;
        let h = this._selectedTab.window.document.documentElement.clientHeight;
        debug("x, y: w, h: " + x + "," + y + "," + w + "," + h + "," + contentWindow.innerHeight + ", " + (y/h) + "," + (y/cssh));

        let diff = this._startY - y;
        debug("diff: " + diff + "," + this._threshold);
        if(diff < -this._threshold) {
            zoomIn(this._zoomStep);
            this._startY = y;
        }
        else if(diff > this._threshold) {
            zoomOut(this._zoomStep);
            this._startY = y;
        }
    },

    _cancelStroke: function(aEvent) {
        debug('_cancelStroke(' + aEvent + ')');
        this._inProgress = false;
        this._stopStroke(aEvent);
    },

    _stopStroke: function(aEvent) {
        debug('_stopStroke(' + aEvent + ')');
        this._inProgress = false;
    },
};

//===========================================
// bootstrap.js API
//===========================================
function install(aData, aReason) {
    OneHandZoom.install();
}

function uninstall(aData, aReason) {
    if (aReason == ADDON_UNINSTALL) {
        OneHandZoom.uninstall();
    }
}

function startup(aData, aReason) {
    // General setup
    OneHandZoom.init();

    // Load into any existing windows
    let windows = Services.wm.getEnumerator('navigator:browser');
    while (windows.hasMoreElements()) {
        let win = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
        if (win) {
            OneHandZoom.load(win);
        }
    }

    // Load into any new windows
    Services.wm.addListener(windowListener);
}

function shutdown(aData, aReason) {
    // When the application is shutting down we normally don't have to clean
    // up any UI changes made
    if (aReason == APP_SHUTDOWN) {
        return;
    }

    // Stop listening for new windows
    Services.wm.removeListener(windowListener);

    // Unload from any existing windows
    let windows = Services.wm.getEnumerator('navigator:browser');
    while (windows.hasMoreElements()) {
        let win = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
        if (win) {
            OneHandZoom.unload(win);
        }
    }

    // General teardown
    OneHandZoom.uninit();
}

//===========================================
// Utilities
//===========================================
function debug(aMsg) {
    if (!DEBUG) {
        return;
    }
    aMsg = 'OneHandZoom: ' + aMsg;
    console.log(aMsg);
}

function getChromeWindow() {
    return Services.wm.getMostRecentWindow('navigator:browser');
}

function getSelectedTab() {
    let selectedTab = getChromeWindow().BrowserApp.selectedTab;
    return selectedTab;
}

function initZoomIfNull() {
    let selectedTab = getSelectedTab();
    if(selectedTab._currentZoom == null) {
        selectedTab._currentZoom = 1.0;
    }
}

function zoomIn(step) {
    let selectedTab = getSelectedTab();
    let chromeWindow = getChromeWindow();

    initZoomIfNull();

    selectedTab._currentZoom *= (1.0 + step);
    if(selectedTab._currentZoom > ZOOM_IN_MAX) {
        selectedTab._currentZoom = ZOOM_IN_MAX;
    }
    let doc  = chromeWindow.content.document;
    doc.body.style.transformOrigin='left top';
    doc.body.style.transform='scale(' + selectedTab._currentZoom + ')';

    debug("=== zoomIn: currentZoom: " + selectedTab._currentZoom);
}

function zoomOut(step) {
    let selectedTab = getSelectedTab();
    let chromeWindow = getChromeWindow();

    initZoomIfNull();

    selectedTab._currentZoom /= (1.0 + step);
    if(selectedTab._currentZoom < ZOOM_OUT_MIN) {
        selectedTab._currentZoom = ZOOM_OUT_MIN;
    }
    let doc  = chromeWindow.content.document;
    doc.body.style.transformOrigin='left top';
    doc.body.style.transform='scale(' + selectedTab._currentZoom + ')';

    debug("=== zoomOut: currentZoom: " + selectedTab._currentZoom);
}

