/*
 * Host API core. The panel never edits the project itself: it calls
 * MES.call(action, argsJson) through evalScript and gets a JSON envelope back.
 *
 * Every action that changes the project runs inside exactly one undo group named
 * after the action, so one Ctrl+Z reverts it. If an action throws, every layer,
 * item and effect it created (registered through ctx.track) is removed before
 * the undo group closes, so a failure never leaves half-built output behind.
 */
(function (M) {
    var registry = {};

    M.VERSION = "0.1.0";

    /**
     * def.fn(args, ctx)  -> result (any JSON-able value)
     * def.undo           -> undo group name; omit for read-only actions
     */
    M.register = function (name, def) {
        registry[name] = def;
    };

    M.actions = function () {
        var out = [];
        var k;
        for (k in registry) {
            if (registry.hasOwnProperty(k)) {
                out.push(k);
            }
        }
        out.sort();
        return out;
    };

    function newContext() {
        var ctx = {
            step: null,
            warnings: [],
            created: []
        };
        ctx.setStep = function (name) {
            ctx.step = name;
        };
        ctx.warn = function (message) {
            ctx.warnings.push(String(message));
        };
        ctx.track = function (obj) {
            ctx.created.push(obj);
            return obj;
        };
        ctx.untrack = function (obj) {
            var i = M.u.indexOf(ctx.created, obj);
            if (i >= 0) {
                ctx.created.splice(i, 1);
            }
        };
        ctx.rollback = function () {
            var removed = 0;
            var i;
            for (i = ctx.created.length - 1; i >= 0; i--) {
                try {
                    ctx.created[i].remove();
                    removed++;
                } catch (ignore) {
                    // Already gone, e.g. an effect on a layer that was removed first.
                }
            }
            ctx.created = [];
            return removed;
        };
        return ctx;
    }

    function describeError(e, ctx, def) {
        var err = {
            message: "",
            code: (e && e.code) || "error",
            step: ctx.step,
            details: {}
        };
        var raw = e && e.message ? e.message : String(e);
        if (e && e.mesUser) {
            err.message = raw;
        } else {
            err.message = (ctx.step ? "Step \"" + ctx.step + "\" failed: " : (def && def.undo ? def.undo + " failed: " : "")) + raw;
            err.details.line = e && e.line !== undefined ? e.line : null;
            err.details.file = e && e.fileName ? String(e.fileName) : null;
            if (typeof $ !== "undefined" && $.stack) {
                err.details.stack = String($.stack);
            }
        }
        return err;
    }

    function envelope(obj) {
        return M.json.stringify(obj);
    }

    M.call = function (name, argsJson) {
        var def = registry[name];
        var ctx = newContext();
        var args, result, undoName, undoOpen, err;

        if (!def) {
            return envelope({ ok: false, error: { message: "Unknown host action: " + name, code: "unknown_action" } });
        }
        try {
            args = argsJson ? M.json.parse(argsJson) : {};
        } catch (parseError) {
            return envelope({ ok: false, error: { message: "Invalid arguments for " + name, code: "bad_args" } });
        }

        undoName = typeof def.undo === "function" ? def.undo(args) : def.undo;
        undoOpen = false;
        try {
            if (undoName) {
                app.beginUndoGroup(undoName);
                undoOpen = true;
            }
            result = def.fn(args || {}, ctx);
            if (undoOpen) {
                undoOpen = false;
                app.endUndoGroup();
            }
            return envelope({ ok: true, result: result === undefined ? null : result, undo: undoName || null, warnings: ctx.warnings });
        } catch (e) {
            err = describeError(e, ctx, def);
            err.rolledBack = ctx.rollback();
            if (undoOpen) {
                try {
                    app.endUndoGroup();
                } catch (ignore) {
                    // Nothing more we can do; the error below still reaches the panel.
                }
            }
            return envelope({ ok: false, error: err, undo: undoName || null, warnings: ctx.warnings });
        }
    };

    M.register("host.ping", {
        fn: function () {
            return {
                hostVersion: M.VERSION,
                aeVersion: app.version,
                buildName: app.buildName,
                os: typeof $ !== "undefined" ? $.os : "unknown",
                language: app.isoLanguage,
                actions: M.actions()
            };
        }
    });
})(MES);
