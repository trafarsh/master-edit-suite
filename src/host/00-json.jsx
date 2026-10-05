/*
 * Master Edit Suite - ExtendScript host layer.
 *
 * Files in src/host are concatenated in name order into one script by
 * scripts/build-host.mjs. Everything here must stay ES3: no let/const, arrow
 * functions, trailing commas, Array.prototype.forEach/indexOf, String trim or
 * native JSON (After Effects' ExtendScript engine has none of these).
 */
var MES = MES || {};

(function (M) {
    function isArray(v) {
        return Object.prototype.toString.call(v) === "[object Array]";
    }

    function quote(s) {
        var out = "\"";
        var i, c, code, hex;
        for (i = 0; i < s.length; i++) {
            c = s.charAt(i);
            code = s.charCodeAt(i);
            if (c === "\"") {
                out += "\\\"";
            } else if (c === "\\") {
                out += "\\\\";
            } else if (c === "\n") {
                out += "\\n";
            } else if (c === "\r") {
                out += "\\r";
            } else if (c === "\t") {
                out += "\\t";
            } else if (code < 32 || code > 126) {
                // Escape everything outside printable ASCII so the string survives
                // evalScript's round trip on every platform and UI language.
                hex = code.toString(16);
                while (hex.length < 4) {
                    hex = "0" + hex;
                }
                out += "\\u" + hex;
            } else {
                out += c;
            }
        }
        return out + "\"";
    }

    function stringify(v) {
        var t, parts, i, k;
        if (v === null || v === undefined) {
            return "null";
        }
        t = typeof v;
        if (t === "number") {
            return isFinite(v) ? String(v) : "null";
        }
        if (t === "boolean") {
            return v ? "true" : "false";
        }
        if (t === "string") {
            return quote(v);
        }
        if (t === "function") {
            return "null";
        }
        if (isArray(v)) {
            parts = [];
            for (i = 0; i < v.length; i++) {
                parts.push(stringify(v[i]));
            }
            return "[" + parts.join(",") + "]";
        }
        parts = [];
        for (k in v) {
            if (v.hasOwnProperty(k) && v[k] !== undefined && typeof v[k] !== "function") {
                parts.push(quote(k) + ":" + stringify(v[k]));
            }
        }
        return "{" + parts.join(",") + "}";
    }

    function parse(s) {
        // Input only ever comes from our own panel (JSON.stringify output).
        return eval("(" + s + ")");
    }

    M.isArray = isArray;
    M.json = { stringify: stringify, parse: parse };
})(MES);
