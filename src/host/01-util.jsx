/*
 * Shared helpers. Effects and properties are always addressed by match name so
 * the panel works in every After Effects UI language.
 */
(function (M) {
    var u = {};

    u.MATCH = {
        effects: "ADBE Effect Parade",
        transform: "ADBE Transform Group",
        anchor: "ADBE Anchor Point",
        position: "ADBE Position",
        positionX: "ADBE Position_0",
        positionY: "ADBE Position_1",
        positionZ: "ADBE Position_2",
        scale: "ADBE Scale",
        rotation: "ADBE Rotate Z",
        opacity: "ADBE Opacity",
        audio: "ADBE Audio Group",
        audioLevels: "ADBE Audio Levels",
        text: "ADBE Text Properties",
        textDocument: "ADBE Text Document",
        textAnimators: "ADBE Text Animators",
        timeRemap: "ADBE Time Remapping",
        marker: "ADBE Marker"
    };

    u.each = function (arr, fn) {
        var i;
        for (i = 0; i < arr.length; i++) {
            if (fn(arr[i], i) === false) {
                return;
            }
        }
    };

    u.map = function (arr, fn) {
        var out = [];
        var i;
        for (i = 0; i < arr.length; i++) {
            out.push(fn(arr[i], i));
        }
        return out;
    };

    u.filter = function (arr, fn) {
        var out = [];
        var i;
        for (i = 0; i < arr.length; i++) {
            if (fn(arr[i], i)) {
                out.push(arr[i]);
            }
        }
        return out;
    };

    u.indexOf = function (arr, v) {
        var i;
        for (i = 0; i < arr.length; i++) {
            if (arr[i] === v) {
                return i;
            }
        }
        return -1;
    };

    u.trim = function (s) {
        return String(s).replace(/^\s+|\s+$/g, "");
    };

    /** A user-facing error: its message is shown as-is in the panel. */
    u.userError = function (message, code) {
        var e = new Error(message);
        e.mesUser = true;
        e.code = code || "user";
        return e;
    };

    u.activeComp = function () {
        var item = app.project ? app.project.activeItem : null;
        if (!item || !(item instanceof CompItem)) {
            throw u.userError("Open a composition first.", "no_comp");
        }
        return item;
    };

    u.selectedLayers = function (comp, min) {
        var layers = [];
        var sel = comp.selectedLayers;
        var i;
        for (i = 0; i < sel.length; i++) {
            layers.push(sel[i]);
        }
        if (min && layers.length < min) {
            throw u.userError(min === 1 ? "Select at least one layer." : "Select at least " + min + " layers.", "selection");
        }
        return layers;
    };

    u.snap = function (comp, t) {
        var fd = comp.frameDuration;
        return Math.round(t / fd) * fd;
    };

    u.frames = function (comp, n) {
        return n * comp.frameDuration;
    };

    u.layerKind = function (layer) {
        var src, main;
        if (typeof CameraLayer !== "undefined" && layer instanceof CameraLayer) {
            return "camera";
        }
        if (typeof LightLayer !== "undefined" && layer instanceof LightLayer) {
            return "light";
        }
        if (layer instanceof TextLayer) {
            return "text";
        }
        if (layer instanceof ShapeLayer) {
            return "shape";
        }
        if (layer.nullLayer) {
            return "null";
        }
        if (layer.adjustmentLayer) {
            return "adjustment";
        }
        src = layer.source;
        if (src instanceof CompItem) {
            return "precomp";
        }
        if (src instanceof FootageItem) {
            main = src.mainSource;
            if (main instanceof SolidSource) {
                return "solid";
            }
            if (!layer.hasVideo && layer.hasAudio) {
                return "audio";
            }
            if (main && main.isStill) {
                return "still";
            }
            return "footage";
        }
        return "other";
    };

    u.isAV = function (layer) {
        return layer instanceof AVLayer;
    };

    u.effects = function (layer) {
        return layer.property(u.MATCH.effects);
    };

    u.transformProp = function (layer, matchName) {
        return layer.property(u.MATCH.transform).property(matchName);
    };

    u.addEffect = function (layer, matchName, ctx) {
        var parade = u.effects(layer);
        var fx;
        if (!parade || !parade.canAddProperty(matchName)) {
            throw u.userError("The effect " + matchName + " is not available on " + layer.name + ".", "effect_missing");
        }
        fx = parade.addProperty(matchName);
        if (ctx) {
            ctx.track(fx);
        }
        return fx;
    };

    u.layerInfo = function (layer) {
        var kind = u.layerKind(layer);
        var av = u.isAV(layer);
        var parade = u.effects(layer);
        return {
            index: layer.index,
            id: layer.id,
            name: layer.name,
            kind: kind,
            inPoint: layer.inPoint,
            outPoint: layer.outPoint,
            startTime: layer.startTime,
            stretch: layer.stretch,
            locked: layer.locked,
            enabled: layer.enabled,
            hasVideo: av ? layer.hasVideo : false,
            hasAudio: av ? layer.hasAudio : false,
            timeRemap: av ? layer.timeRemapEnabled : false,
            threeD: av ? layer.threeDLayer : false,
            sourceId: av && layer.source ? layer.source.id : null,
            numEffects: parade ? parade.numProperties : 0,
            parentIndex: layer.parent ? layer.parent.index : null,
            comment: layer.comment || ""
        };
    };

    u.compInfo = function (comp) {
        return {
            id: comp.id,
            name: comp.name,
            width: comp.width,
            height: comp.height,
            pixelAspect: comp.pixelAspect,
            frameRate: comp.frameRate,
            frameDuration: comp.frameDuration,
            duration: comp.duration,
            time: comp.time,
            displayStartTime: comp.displayStartTime,
            numLayers: comp.numLayers
        };
    };

    /** Adds `delta` (array) to a property's value or to every keyframe when keyframed. */
    u.offsetProperty = function (prop, delta) {
        var k, v;
        function add(value) {
            var out = [];
            var i;
            if (typeof value === "number") {
                return value + delta[0];
            }
            for (i = 0; i < value.length; i++) {
                out.push(value[i] + (i < delta.length ? delta[i] : 0));
            }
            return out;
        }
        if (prop.numKeys > 0) {
            for (k = 1; k <= prop.numKeys; k++) {
                v = prop.keyValue(k);
                prop.setValueAtKey(k, add(v));
            }
        } else {
            prop.setValue(add(prop.value));
        }
    };

    /** Shifts a layer's position by [dx, dy], handling separated dimensions. */
    u.offsetPosition = function (layer, dx, dy) {
        var tr = layer.property(u.MATCH.transform);
        var pos = tr.property(u.MATCH.position);
        if (pos.dimensionsSeparated) {
            u.offsetProperty(tr.property(u.MATCH.positionX), [dx]);
            u.offsetProperty(tr.property(u.MATCH.positionY), [dy]);
        } else {
            u.offsetProperty(pos, [dx, dy]);
        }
    };

    u.findLayerById = function (comp, id) {
        var i;
        for (i = 1; i <= comp.numLayers; i++) {
            if (comp.layer(i).id === id) {
                return comp.layer(i);
            }
        }
        return null;
    };

    u.plural = function (n, one, many) {
        return n + " " + (n === 1 ? one : (many || one + "s"));
    };

    M.u = u;
})(MES);
