/*
 * Library: apply .ffx presets, insert sound effects and textures. Imported files
 * go into a "Library" project folder and are reused when already imported.
 */
(function (M) {
    var u = M.u;
    var LIB_FOLDER = "Library";

    function libraryFolder() {
        var root = app.project.rootFolder;
        var i, it;
        for (i = 1; i <= root.numItems; i++) {
            it = root.item(i);
            if (it instanceof FolderItem && it.name === LIB_FOLDER) {
                return it;
            }
        }
        return app.project.items.addFolder(LIB_FOLDER);
    }

    function importOnce(path, ctx) {
        var f = new File(path);
        var i, it, item;
        if (!f.exists) {
            throw u.userError("The file is missing: " + path + ". Refresh the library.", "missing_file");
        }
        for (i = 1; i <= app.project.numItems; i++) {
            it = app.project.item(i);
            if (it instanceof FootageItem && it.file && it.file.fsName === f.fsName) {
                return it;
            }
        }
        item = ctx.track(app.project.importFile(new ImportOptions(f)));
        item.parentFolder = libraryFolder();
        return item;
    }

    /** Adds `item` at the playhead, directly above the topmost selected layer if any. */
    function addAtPlayhead(comp, item, ctx) {
        var sel = comp.selectedLayers;
        var top = null;
        var i, layer;
        for (i = 0; i < sel.length; i++) {
            if (!top || sel[i].index < top.index) {
                top = sel[i];
            }
        }
        layer = ctx.track(comp.layers.add(item));
        layer.startTime = u.snap(comp, comp.time);
        if (top) {
            layer.moveBefore(top);
        }
        return layer;
    }

    M.register("library.insertSound", {
        undo: "Insert Sound Effect",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var item = importOnce(args.file, ctx);
            var layer;
            if (!item.hasAudio) {
                throw u.userError(item.name + " has no audio.", "no_audio");
            }
            layer = addAtPlayhead(comp, item, ctx);
            layer.label = 11;
            layer.comment = "mes:library";
            ctx.created = [];
            return { name: layer.name, time: layer.startTime };
        }
    });

    M.register("library.insertTexture", {
        undo: "Insert Texture",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var item = importOnce(args.file, ctx);
            var layer, s, mode;
            if (!item.hasVideo) {
                throw u.userError(item.name + " has no image.", "no_video");
            }
            layer = addAtPlayhead(comp, item, ctx);
            // Fill the comp so the overlay never shows an edge.
            s = Math.max(comp.width / item.width, comp.height / item.height) * 100;
            layer.property(u.MATCH.transform).property(u.MATCH.scale).setValue([s, s]);
            layer.property(u.MATCH.transform).property(u.MATCH.position).setValue([comp.width / 2, comp.height / 2]);
            mode = args.blendMode && BlendingMode[args.blendMode];
            if (mode !== undefined && mode !== null) {
                layer.blendingMode = mode;
            }
            if (item.mainSource && item.mainSource.isStill) {
                layer.outPoint = Math.max(layer.inPoint + comp.frameDuration, comp.duration);
            }
            layer.comment = "mes:library";
            ctx.created = [];
            return { name: layer.name };
        }
    });

    // --- Presets ---------------------------------------------------------------

    /** Calls fn(prop, path) for every keyframable property under `group`. */
    function walk(group, path, fn) {
        var i, p, key;
        for (i = 1; i <= group.numProperties; i++) {
            p = group.property(i);
            key = path + "/" + i + ":" + p.matchName;
            if (p instanceof Property) {
                if (p.canVaryOverTime) {
                    fn(p, key);
                }
            } else {
                walk(p, key, fn);
            }
        }
    }

    function keyTimes(prop) {
        var out = [];
        var k;
        for (k = 1; k <= prop.numKeys; k++) {
            out.push(prop.keyTime(k));
        }
        return out;
    }

    function snapshotKeys(layer) {
        var snap = {};
        walk(layer, "", function (p, key) {
            snap[key] = keyTimes(p);
        });
        return snap;
    }

    function containsTime(times, t) {
        var i;
        for (i = 0; i < times.length; i++) {
            if (Math.abs(times[i] - t) < 1e-4) {
                return true;
            }
        }
        return false;
    }

    /** Keys that were not on the layer before the preset was applied. */
    function newKeys(layer, before) {
        var out = [];
        walk(layer, "", function (p, key) {
            var old = before[key] || [];
            var idx = [];
            var k;
            for (k = 1; k <= p.numKeys; k++) {
                if (!containsTime(old, p.keyTime(k))) {
                    idx.push(k);
                }
            }
            if (idx.length) {
                out.push({ prop: p, keys: idx });
            }
        });
        return out;
    }

    function scaledEase(arr, factor) {
        var out = [];
        var i;
        for (i = 0; i < arr.length; i++) {
            out.push(new KeyframeEase(arr[i].speed / factor, arr[i].influence));
        }
        return out;
    }

    /** Moves keys to map(time), keeping value, interpolation, ease shape and spatial tangents. */
    function retime(prop, indices, map, factor) {
        var snaps = [];
        var i, k, s;
        for (i = 0; i < indices.length; i++) {
            k = indices[i];
            s = {
                time: prop.keyTime(k),
                value: prop.keyValue(k),
                inType: prop.keyInInterpolationType(k),
                outType: prop.keyOutInterpolationType(k),
                inEase: prop.keyInTemporalEase(k),
                outEase: prop.keyOutTemporalEase(k)
            };
            if (prop.isSpatial) {
                s.inTan = prop.keyInSpatialTangent(k);
                s.outTan = prop.keyOutSpatialTangent(k);
            }
            snaps.push(s);
        }
        for (i = indices.length - 1; i >= 0; i--) {
            prop.removeKey(indices[i]);
        }
        for (i = 0; i < snaps.length; i++) {
            s = snaps[i];
            k = prop.addKey(map(s.time));
            prop.setValueAtKey(k, s.value);
            prop.setInterpolationTypeAtKey(k, s.inType, s.outType);
            prop.setTemporalEaseAtKey(k, scaledEase(s.inEase, factor), scaledEase(s.outEase, factor));
            if (s.inTan) {
                prop.setSpatialTangentsAtKey(k, s.inTan, s.outTan);
            }
        }
    }

    /** Stretches the preset's keys, which start at `start`, to end on the layer's last frame. */
    function stretchToLayer(comp, layer, added, start) {
        var last = start;
        var i, j, t, end, factor;
        for (i = 0; i < added.length; i++) {
            for (j = 0; j < added[i].keys.length; j++) {
                t = added[i].prop.keyTime(added[i].keys[j]);
                if (t > last) {
                    last = t;
                }
            }
        }
        end = layer.outPoint - comp.frameDuration;
        if (last - start < 1e-6 || end <= start) {
            return false;
        }
        factor = (end - start) / (last - start);
        for (i = 0; i < added.length; i++) {
            retime(added[i].prop, added[i].keys, function (time) {
                return start + (time - start) * factor;
            }, factor);
        }
        return true;
    }

    /**
     * Applies an .ffx preset to every selected, unlocked layer. Layer.applyPreset
     * acts on all selected layers at the playhead, so the simple case is one call;
     * "apply at layer start" and "stretch" need one layer at a time, after which
     * the selection and playhead are restored.
     */
    M.register("library.applyPreset", {
        undo: "Apply Preset",
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var all = u.selectedLayers(comp, 1);
            var layers = [];
            var file = new File(args.file);
            var time = comp.time;
            var i, j, layer, start, before, added, stretched;

            if (!file.exists) {
                throw u.userError("The preset file is missing. Refresh the library.", "missing_file");
            }
            for (i = 0; i < all.length; i++) {
                if (all[i].locked) {
                    ctx.warn(all[i].name + ": locked, skipped.");
                    all[i].selected = false;
                } else {
                    layers.push(all[i]);
                }
            }
            if (!layers.length) {
                throw u.userError("Every selected layer is locked.", "locked");
            }
            if (!args.atLayerStart && !args.stretch) {
                layers[0].applyPreset(file);
            } else {
                stretched = 0;
                try {
                    for (i = 0; i < layers.length; i++) {
                        layer = layers[i];
                        ctx.setStep("Apply to " + layer.name);
                        for (j = 0; j < layers.length; j++) {
                            layers[j].selected = j === i;
                        }
                        start = args.atLayerStart ? layer.inPoint : time;
                        comp.time = start;
                        before = args.stretch ? snapshotKeys(layer) : null;
                        layer.applyPreset(file);
                        if (args.stretch) {
                            added = newKeys(layer, before);
                            if (stretchToLayer(comp, layer, added, start)) {
                                stretched++;
                            }
                        }
                    }
                } finally {
                    comp.time = time;
                    for (j = 0; j < layers.length; j++) {
                        layers[j].selected = true;
                    }
                }
                if (args.stretch && stretched < layers.length) {
                    ctx.warn("Keyframes were stretched on " + stretched + " of " + layers.length + " layers (the rest had nothing to stretch).");
                }
            }
            for (i = 0; i < all.length; i++) {
                all[i].selected = true;
            }
            return { layers: layers.length };
        }
    });

    /** Installed effects whose match name or display name contains `pattern`. */
    M.register("host.findEffects", {
        fn: function (args) {
            var pattern = String(args.pattern || "").toLowerCase();
            var out = [];
            var list = app.effects;
            var i;
            for (i = 0; i < list.length; i++) {
                if (String(list[i].matchName).toLowerCase().indexOf(pattern) >= 0 ||
                    String(list[i].displayName).toLowerCase().indexOf(pattern) >= 0) {
                    out.push(list[i].matchName);
                }
            }
            return { matchNames: out };
        }
    });

    M.library = { stretchToLayer: stretchToLayer, snapshotKeys: snapshotKeys, newKeys: newKeys };
})(MES);
