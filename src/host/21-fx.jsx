/*
 * FX manager: lists every effect in the comp grouped by effect type and switches
 * whole groups on or off.
 */
(function (M) {
    var u = M.u;

    function scopeLayers(comp, scope) {
        var out = [];
        var i;
        if (scope === "selected") {
            return u.selectedLayers(comp, 0);
        }
        for (i = 1; i <= comp.numLayers; i++) {
            out.push(comp.layer(i));
        }
        return out;
    }

    /** Calls fn(layer, effect, effectIndex) for every effect in scope. */
    function eachEffect(layers, fn) {
        var i, j, parade;
        for (i = 0; i < layers.length; i++) {
            parade = u.effects(layers[i]);
            if (!parade) {
                continue;
            }
            for (j = 1; j <= parade.numProperties; j++) {
                fn(layers[i], parade.property(j), j);
            }
        }
    }

    M.register("fx.list", {
        fn: function (args) {
            var comp = u.activeComp();
            var layers = scopeLayers(comp, args.scope);
            var groups = {};
            var order = [];
            var total = 0;
            var out = [];
            var i, g;

            eachEffect(layers, function (layer, fx) {
                var key = fx.matchName;
                var grp = groups[key];
                if (!grp) {
                    grp = groups[key] = { matchName: key, name: fx.name, count: 0, on: 0, layerIds: [] };
                    order.push(key);
                }
                // Instances renamed "Gaussian Blur 2" etc.: the shortest name is the default one.
                if (fx.name.length < grp.name.length) {
                    grp.name = fx.name;
                }
                grp.count++;
                if (fx.enabled) {
                    grp.on++;
                }
                if (u.indexOf(grp.layerIds, layer.id) < 0) {
                    grp.layerIds.push(layer.id);
                }
                total++;
            });
            for (i = 0; i < order.length; i++) {
                g = groups[order[i]];
                g.state = g.on === 0 ? "off" : (g.on === g.count ? "on" : "mixed");
                out.push(g);
            }
            out.sort(function (a, b) {
                var x = a.name.toLowerCase();
                var y = b.name.toLowerCase();
                return x < y ? -1 : (x > y ? 1 : 0);
            });
            return { groups: out, total: total, layers: layers.length };
        }
    });

    /**
     * Switches every effect in scope with the given match name (or every effect when
     * matchName is null). Switching off returns the instances that were on, so the
     * panel can pass them back as `restore` and switch on exactly those again.
     */
    M.register("fx.setEnabled", {
        undo: function (args) {
            return args.enabled ? "Enable Effects" : "Disable Effects";
        },
        fn: function (args, ctx) {
            var comp = u.activeComp();
            var layers = scopeLayers(comp, args.scope);
            var changed = [];
            var lockedSkipped = 0;
            var restore = args.restore || null;
            var wanted = {};
            var i;

            if (restore) {
                for (i = 0; i < restore.length; i++) {
                    wanted[restore[i].layerId + ":" + restore[i].index] = restore[i].matchName;
                }
            }
            eachEffect(layers, function (layer, fx, index) {
                if (args.matchName && fx.matchName !== args.matchName) {
                    return;
                }
                if (restore && wanted[layer.id + ":" + index] !== fx.matchName) {
                    return;
                }
                if (fx.enabled === !!args.enabled) {
                    return;
                }
                if (layer.locked) {
                    lockedSkipped++;
                    return;
                }
                fx.enabled = !!args.enabled;
                changed.push({ layerId: layer.id, index: index, matchName: fx.matchName });
            });
            if (lockedSkipped > 0) {
                ctx.warn(u.plural(lockedSkipped, "effect") + " on locked layers left unchanged.");
            }
            return { changed: changed };
        }
    });

    M.register("fx.selectLayers", {
        fn: function (args) {
            var comp = u.activeComp();
            var count = 0;
            var i, layer, parade, j, has;
            for (i = 1; i <= comp.numLayers; i++) {
                layer = comp.layer(i);
                parade = u.effects(layer);
                has = false;
                if (parade) {
                    for (j = 1; j <= parade.numProperties; j++) {
                        if (parade.property(j).matchName === args.matchName) {
                            has = true;
                            break;
                        }
                    }
                }
                layer.selected = has;
                if (has) {
                    count++;
                }
            }
            return { selected: count };
        }
    });
})(MES);
