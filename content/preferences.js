const Ci = Components.interfaces;
const Cc = Components.classes;
const Cu = Components.utils;
Cu.import('resource:gre/modules/Services.jsm');

let gStringBundle = null;
let gUserMapK2G = {};

let gBranch = Services.prefs.getBranch('extensions.quickgestures2.');

function log(aMsg) {
    aMsg = 'QuickGestures2#preferences.js: ' + aMsg;
    Services.console.logStringMessage(aMsg);
}

function tr(aName) {
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

function sanitize(aString) {
    return aString.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;');
}

function validateGesture(aGesture, aOverlapCheck) {
    aGesture = aGesture.replace(/U+/g, 'U')
                       .replace(/D+/g, 'D')
                       .replace(/L+/g, 'L')
                       .replace(/R+/g, 'R')
                       .trim();

    if (aGesture && !aGesture.match(/^[UDLR]+$/)) {
        let title = tr('InvalidSeqWarning_Title');
        let msg = tr('InvalidSeqWarning_Msg');
        Services.prompt.alert(null, title, msg);
        throw 'InvalidSeqWarning';
    }

    if (aOverlapCheck) {
        if (aGesture.length == 1){
            let title = tr('OneCharGestureWarning_Title');
            let msg = tr('OneCharGestureWarning_Msg');
            Services.prompt.alert(null, title, msg);
            throw 'OneCharGestureWarning';
        }

        for (let key in gUserMapK2G) {
            let gesture = gUserMapK2G[key];
            if (aGesture && aGesture == gesture) {
                let title = tr('OverlapWarning_Title');
                let msg = tr('OverlapWarning_Msg')
                            .replace('{gesture}', gesture)
                            .replace('{name}', tr(key));

                Services.prompt.alert(null, title, msg);
                throw 'OverlapWarning';
            }
        }
    }
    return aGesture;
}

function showRemapDialog() {
    let target = this;
    let name = target.getAttribute('qg-name');
    let key = target.getAttribute('qg-key');
    let gesture;

    try {
        gesture = validateGesture(target.textContent, false);
    } catch(ex) {
        gesture = '';
    }

    // Display prompt to remap gesture
    let title = name; // tr('RemapPrompt_Title');
    let msg = tr('RemapPrompt_Msg');
    let ret = {value: gesture};
    let ok = Services.prompt.prompt(null, title, msg, ret, null, {});
    if (ok) {
        let newGesture = ret.value;

        if (newGesture == gesture)
            return;

        try {
            newGesture = validateGesture(newGesture, true);
        } catch(ex) {
            return;
        }

        while (target.firstChild)
            target.removeChild(target.firstChild);

        let textNode = target.ownerDocument.createTextNode(newGesture || '  ');  
        target.appendChild(textNode);

        gUserMapK2G[key] = newGesture;
        gBranch.setCharPref('mapk2g', JSON.stringify(gUserMapK2G));
    }
}

function showResetGesturesDialog() {
    let title = tr('ResetGesturesDialog_Title');
    let msg = tr('ResetGesturesDialog_Msg');

    let ok = Services.prompt.confirm(null, title, msg);
    if (ok) {
        gBranch.clearUserPref('mapk2g');
        window.location.reload();
    }
}

function showResetSettingsDialog() {
    let title = tr('ResetSettingsDialog_Title');
    let msg = tr('ResetSettingsDialog_Msg');

    let ok = Services.prompt.confirm(null, title, msg);
    if (ok) {
        gBranch.clearUserPref('layer.visible');
        gBranch.clearUserPref('toast.visible');
        gBranch.clearUserPref('threshold.splits');
        gBranch.clearUserPref('threshold.angle');
        gBranch.clearUserPref('threshold.timeout');
        window.location.reload();
    }
}


function onLoad() {
    // Gestures Panel
    let mapk2g_json = gBranch.getCharPref('mapk2g');
    
    gUserMapK2G = JSON.parse(mapk2g_json);

    let listItemTemplate =
        '<div class="content pref-gesture">\n' +
        '  <div class="g-cmd">{name}</div>\n' +
        '  <div class="g-seq" id="g-{key}" qg-key="{key}" qg-name="{name}" >{gesture}</div>\n' +
        '</div>\n';

    let listItems = '';

    for (let commandKey in gUserMapK2G) {
        let gesture = gUserMapK2G[commandKey];
        let name = sanitize(tr(commandKey));

        let listItem = listItemTemplate.replace(/{gesture}/g, gesture || '&#160;')
                                       .replace(/{name}/g, name)
                                       .replace(/{key}/g, commandKey);
        listItems += listItem;
    }

    // Insert items
    document.getElementById('gestures').innerHTML = listItems;

    for (let item of document.getElementsByClassName('g-seq')) {
        item.addEventListener('click', showRemapDialog, false);
    }

    // Reset button
    document.getElementById('gestures-reset-button').addEventListener('click', showResetGesturesDialog, false);
    document.getElementById('settings-reset-button').addEventListener('click', showResetSettingsDialog, false);


    // Settings Panel
    // Set default values
    document.getElementById('layerVisible').checked = gBranch.getBoolPref('layer.visible');
    document.getElementById('toastVisible').checked = gBranch.getBoolPref('toast.visible');
    document.getElementById('splitsSeekbarInput').value = gBranch.getIntPref('threshold.splits');
    document.getElementById('angleSeekbarInput').value = gBranch.getIntPref('threshold.angle');

    let timeout = gBranch.getIntPref('threshold.timeout');
    document.getElementById('timeoutSeekbarInput').value = Math.floor(100 * Math.LOG10E * Math.log(2 * timeout));

    document.getElementById('splitsSeekbarOutput').value = gBranch.getIntPref('threshold.splits');
    document.getElementById('angleSeekbarOutput').value = gBranch.getIntPref('threshold.angle');
    document.getElementById('timeoutSeekbarOutput').value = gBranch.getIntPref('threshold.timeout') + 'ms';


    // Set event listeners
    document.querySelector('.pref-checkbox[for="layerVisible"]').addEventListener('click', function() {
        let cb = document.getElementById('layerVisible');
        cb.checked = !cb.checked;
        gBranch.setBoolPref('layer.visible', cb.checked);
    }, false);

    document.querySelector('.pref-checkbox[for="toastVisible"]').addEventListener('click', function() {
        let cb = document.getElementById('toastVisible');
        cb.checked = !cb.checked;
        gBranch.setBoolPref('toast.visible', cb.checked);
    }, false);

    document.getElementById('timeoutSeekbarInput').addEventListener('input', function() {
        let timeout = Math.floor(Math.pow(10.0, parseFloat(this.value)/100-0.301));
        document.getElementById('timeoutSeekbarOutput').value = timeout + 'ms';
        gBranch.setIntPref('threshold.timeout', timeout);
    }, false);

    document.getElementById('splitsSeekbarInput').addEventListener('input', function() {
        document.getElementById('splitsSeekbarOutput').value = this.value;
        gBranch.setIntPref('threshold.splits', this.value);
    }, false);

    document.getElementById('angleSeekbarInput').addEventListener('input', function() {
        document.getElementById('angleSeekbarOutput').value = this.value;
        gBranch.setIntPref('threshold.angle', this.value);
    }, false);


    // Disable the seekbars because the new `range` input
    // will be supported from Firefox 23.
    //
    let firefoxApp = Cc['@mozilla.org/xre/app-info;1'].getService(Ci.nsIXULAppInfo);
    if (parseFloat(firefoxApp.version) < 23.0) {
        document.getElementById('timeout-section').className += ' disabled';
        document.getElementById('recognition-section').className += ' disabled';
    }
}

document.addEventListener('DOMContentLoaded', onLoad, false);

