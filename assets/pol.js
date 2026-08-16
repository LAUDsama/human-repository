/* The Human Repository — Proof of Life (.pol)  v0.1.0
   Vanilla JS. No dependencies. Runs in the browser only.
   A .pol file is evidence + attestation, not cryptographic proof of humanity.
   CC0 1.0. No rights reserved. */
(function (global) {
  "use strict";

  var FORMAT = "pol";
  var VERSION = "0.1.0";
  var EMBED_MAX_BYTES = 262144;
  var DEFAULT_ATTESTATION =
    "I attest that I am a human and that I made, or substantially made, this work through lived effort. This file is evidence and a first-person statement, not a lie detector and not cryptographic proof of humanity. Anything I included — time, place, effort, or body signals — was added by me on purpose.";

  function isObject(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
  }

  function sortValue(value) {
    if (Array.isArray(value)) {
      return value.map(sortValue);
    }
    if (isObject(value)) {
      var out = {};
      Object.keys(value).sort().forEach(function (key) {
        if (value[key] !== undefined) {
          out[key] = sortValue(value[key]);
        }
      });
      return out;
    }
    return value;
  }

  function canonicalJson(value) {
    return JSON.stringify(sortValue(value));
  }

  function toHex(buffer) {
    var bytes = new Uint8Array(buffer);
    var hex = "";
    for (var i = 0; i < bytes.length; i += 1) {
      var h = bytes[i].toString(16);
      hex += h.length === 1 ? "0" + h : h;
    }
    return hex;
  }

  function sha256Bytes(bytes) {
    return global.crypto.subtle.digest("SHA-256", bytes).then(toHex);
  }

  function sha256Text(text) {
    return sha256Bytes(new TextEncoder().encode(text));
  }

  function emptyToNull(value) {
    if (value == null) {
      return null;
    }
    var trimmed = String(value).trim();
    return trimmed === "" ? null : trimmed;
  }

  function toNumber(value) {
    if (value === "" || value == null) {
      return null;
    }
    var n = Number(value);
    return isFinite(n) ? n : null;
  }

  function parseIso(value) {
    if (!value) {
      return null;
    }
    var date = new Date(value);
    return isNaN(date.getTime()) ? null : date;
  }

  function localInputToIso(value) {
    var date = parseIso(value);
    return date ? date.toISOString() : null;
  }

  function formatWhen(iso) {
    if (!iso) {
      return "Not recorded";
    }
    var date = parseIso(iso);
    return date ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : iso;
  }

  function formatDuration(seconds) {
    if (seconds == null || !isFinite(seconds) || seconds < 0) {
      return "Not recorded";
    }
    var s = Math.round(seconds);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var rem = s % 60;
    if (h > 0) {
      return h + "h " + m + "m";
    }
    if (m > 0) {
      return m + "m " + rem + "s";
    }
    return rem + "s";
  }

  function slugFilename(title) {
    var slug = String(title || "untitled")
      .toLowerCase()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .replace(/^$/, "untitled");
    return slug + ".pol";
  }

  function guessWorkType(file) {
    if (!file) {
      return "other";
    }
    var type = (file.type || "").toLowerCase();
    var name = (file.name || "").toLowerCase();
    if (type.indexOf("audio") === 0 || /\.(mp3|wav|flac|aac|ogg|m4a)$/.test(name)) {
      return "audio";
    }
    if (type.indexOf("image") === 0 || /\.(png|jpe?g|gif|webp|tif|svg)$/.test(name)) {
      return "image";
    }
    if (type.indexOf("video") === 0 || /\.(mp4|mov|webm|mkv)$/.test(name)) {
      return "video";
    }
    if (type.indexOf("text") === 0 || /\.(txt|md|html|csv|json)$/.test(name)) {
      return "text";
    }
    return "other";
  }

  function bytesToBase64(bytes) {
    var chunk = 0x8000;
    var parts = [];
    for (var i = 0; i < bytes.length; i += chunk) {
      parts.push(String.fromCharCode.apply(null, bytes.subarray(i, i + chunk)));
    }
    return btoa(parts.join(""));
  }

  function splitCsvLine(line) {
    var out = [];
    var cur = "";
    var inQuotes = false;
    for (var i = 0; i < line.length; i += 1) {
      var ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === "," && !inQuotes) {
        out.push(cur.trim());
        cur = "";
      } else {
        cur += ch;
      }
    }
    out.push(cur.trim());
    return out;
  }

  function normalizeHeader(name) {
    return String(name || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  }

  function parseWearableCsv(text) {
    var lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(function (line) {
      return line.trim() !== "";
    });
    if (!lines.length) {
      return { rows: [], error: "The CSV was empty." };
    }

    var headers = splitCsvLine(lines[0]).map(normalizeHeader);
    var tsIdx = headers.indexOf("timestamp");
    if (tsIdx < 0) {
      tsIdx = headers.indexOf("time");
    }
    var hrIdx = headers.indexOf("hr");
    if (hrIdx < 0) {
      hrIdx = headers.indexOf("heartrate");
    }
    if (hrIdx < 0) {
      hrIdx = headers.indexOf("bpm");
    }
    var stepsIdx = headers.indexOf("steps");
    var gsrIdx = headers.indexOf("gsr");
    if (gsrIdx < 0) {
      gsrIdx = headers.indexOf("eda");
    }
    if (gsrIdx < 0) {
      gsrIdx = headers.indexOf("skinconductance");
    }

    if (hrIdx < 0 && stepsIdx < 0 && gsrIdx < 0) {
      return {
        rows: [],
        error: "Need a header row with at least hr (or heartrate/bpm), steps, or gsr/eda."
      };
    }

    var rows = [];
    for (var i = 1; i < lines.length; i += 1) {
      var cols = splitCsvLine(lines[i]);
      var row = {
        timestamp: tsIdx >= 0 ? emptyToNull(cols[tsIdx]) : null,
        hr: hrIdx >= 0 ? toNumber(cols[hrIdx]) : null,
        steps: stepsIdx >= 0 ? toNumber(cols[stepsIdx]) : null,
        gsr: gsrIdx >= 0 ? toNumber(cols[gsrIdx]) : null
      };
      if (row.hr != null || row.steps != null || row.gsr != null) {
        rows.push(row);
      }
    }

    return { rows: rows, error: rows.length ? null : "No numeric sample rows were found." };
  }

  function summarizeWearableRows(rows) {
    var hrs = [];
    var steps = [];
    var gsrs = [];
    rows.forEach(function (row) {
      if (row.hr != null) {
        hrs.push(row.hr);
      }
      if (row.steps != null) {
        steps.push(row.steps);
      }
      if (row.gsr != null) {
        gsrs.push(row.gsr);
      }
    });

    function stats(list) {
      if (!list.length) {
        return null;
      }
      var sum = 0;
      var min = list[0];
      var max = list[0];
      for (var i = 0; i < list.length; i += 1) {
        sum += list[i];
        if (list[i] < min) {
          min = list[i];
        }
        if (list[i] > max) {
          max = list[i];
        }
      }
      return {
        min: Math.round(min * 10) / 10,
        avg: Math.round((sum / list.length) * 10) / 10,
        max: Math.round(max * 10) / 10,
        samples: list.length
      };
    }

    var stepTotal = null;
    if (steps.length) {
      var rising = 0;
      for (var i = 1; i < steps.length; i += 1) {
        if (steps[i] >= steps[i - 1]) {
          rising += 1;
        }
      }
      var mostlyCumulative = steps.length > 1 && rising / (steps.length - 1) >= 0.7;
      stepTotal = mostlyCumulative
        ? Math.round(Math.max.apply(null, steps))
        : Math.round(steps.reduce(function (a, b) {
          return a + b;
        }, 0));
    }

    return {
      heart_rate: stats(hrs),
      steps: stepTotal,
      skin_conductance: stats(gsrs),
      sample_count: rows.length
    };
  }

  function blankCreator() {
    return { name: null, handle: null, public_key: null };
  }

  function blankLocation() {
    return { label: null, lat: null, lon: null, accuracy_m: null, source: null };
  }

  function blankWork() {
    return { type: "other", filename: null, sha256: null, bytes: null, note: null, embedded: null };
  }

  function blankEffort() {
    return {
      hours: null,
      drafts: null,
      tools: [],
      interruptions: null,
      what_was_hard: null,
      narrative: null,
      collaborators: []
    };
  }

  function blankBiometrics() {
    return {
      included: false,
      self_attested: true,
      device_signed: false,
      source: null,
      device: null,
      heart_rate: null,
      steps: null,
      active_minutes: null,
      sweat_or_skin_conductance: null,
      sample_count: 0,
      note: "Self-attested unless a later device signature is present. Not covertly captured."
    };
  }

  function buildDocument(input) {
    var src = input || {};
    var start = src.session_start || null;
    var end = src.session_end || null;
    var duration = toNumber(src.duration_seconds);
    if (duration == null && start && end) {
      var a = parseIso(start);
      var b = parseIso(end);
      if (a && b) {
        duration = Math.max(0, Math.round((b.getTime() - a.getTime()) / 1000));
      }
    }

    var tools = Array.isArray(src.tools) ? src.tools : [];
    var collaborators = Array.isArray(src.collaborators) ? src.collaborators : [];

    var location = blankLocation();
    if (src.location && (src.location.label || src.location.lat != null)) {
      location.label = emptyToNull(src.location.label);
      location.lat = src.location.lat != null ? Number(src.location.lat) : null;
      location.lon = src.location.lon != null ? Number(src.location.lon) : null;
      location.accuracy_m = src.location.accuracy_m != null ? Number(src.location.accuracy_m) : null;
      location.source = emptyToNull(src.location.source);
    } else {
      location = null;
    }

    var work = blankWork();
    work.type = emptyToNull(src.work && src.work.type) || "other";
    work.filename = emptyToNull(src.work && src.work.filename);
    work.sha256 = emptyToNull(src.work && src.work.sha256);
    work.bytes = src.work && src.work.bytes != null ? Number(src.work.bytes) : null;
    work.note = emptyToNull(src.work && src.work.note);
    work.embedded = src.work && src.work.embedded ? src.work.embedded : null;

    var effort = blankEffort();
    effort.hours = toNumber(src.effort && src.effort.hours);
    if (effort.hours == null && duration != null) {
      effort.hours = Math.round((duration / 3600) * 100) / 100;
    }
    effort.drafts = toNumber(src.effort && src.effort.drafts);
    effort.tools = tools.map(function (item) {
      return String(item).trim();
    }).filter(Boolean);
    effort.interruptions = emptyToNull(src.effort && src.effort.interruptions);
    effort.what_was_hard = emptyToNull(src.effort && src.effort.what_was_hard);
    effort.narrative = emptyToNull(src.effort && src.effort.narrative);
    effort.collaborators = collaborators.map(function (item) {
      return String(item).trim();
    }).filter(Boolean);

    var bioIn = src.biometrics || {};
    var biometrics = null;
    if (bioIn.included) {
      biometrics = blankBiometrics();
      biometrics.included = true;
      biometrics.self_attested = bioIn.self_attested !== false;
      biometrics.device_signed = !!bioIn.device_signed;
      biometrics.source = emptyToNull(bioIn.source) || "manual";
      biometrics.device = emptyToNull(bioIn.device);
      biometrics.heart_rate = bioIn.heart_rate || null;
      biometrics.steps = toNumber(bioIn.steps);
      biometrics.active_minutes = toNumber(bioIn.active_minutes);
      biometrics.sweat_or_skin_conductance = bioIn.sweat_or_skin_conductance || null;
      biometrics.sample_count = toNumber(bioIn.sample_count) || 0;
      biometrics.note = emptyToNull(bioIn.note) || biometrics.note;
    }

    var privacy = {
      location_included: !!(location && (location.label || location.lat != null)),
      coordinates_included: !!(location && location.lat != null && location.lon != null),
      biometrics_included: !!(biometrics && biometrics.included),
      work_embedded: !!(work.embedded && work.embedded.data),
      work_hashed: !!work.sha256
    };

    return {
      format: FORMAT,
      version: VERSION,
      title: emptyToNull(src.title) || "Untitled work",
      creator: {
        name: emptyToNull(src.creator && src.creator.name),
        handle: emptyToNull(src.creator && src.creator.handle),
        public_key: emptyToNull(src.creator && src.creator.public_key)
      },
      created: {
        session_start: start,
        session_end: end,
        recorded_at: src.recorded_at || new Date().toISOString()
      },
      duration_seconds: duration,
      location: location,
      work: work,
      attestation: {
        statement: emptyToNull(src.attestation && src.attestation.statement) || DEFAULT_ATTESTATION,
        signed: false,
        signature: null,
        algorithm: null
      },
      effort: effort,
      biometrics: biometrics,
      related: {
        c2pa_sidecar: emptyToNull(src.related && src.related.c2pa_sidecar),
        work_url: emptyToNull(src.related && src.related.work_url)
      },
      privacy: privacy,
      integrity: {
        alg: "sha256",
        canonical_sha256: "",
        note: "SHA-256 of the canonical JSON with integrity.canonical_sha256 set to an empty string. This detects later edits to this file; it does not prove a human made the work."
      }
    };
  }

  function sealIntegrity(doc) {
    var sealed = clone(doc);
    if (!sealed.integrity) {
      sealed.integrity = { alg: "sha256", canonical_sha256: "", note: "" };
    }
    sealed.integrity.canonical_sha256 = "";
    return sha256Text(canonicalJson(sealed)).then(function (hash) {
      sealed.integrity.canonical_sha256 = hash;
      return sealed;
    });
  }

  function verifyIntegrity(doc) {
    if (!doc || !doc.integrity || !doc.integrity.canonical_sha256) {
      return Promise.resolve({ ok: false, reason: "No integrity hash is present." });
    }
    var stored = doc.integrity.canonical_sha256;
    var copy = clone(doc);
    copy.integrity.canonical_sha256 = "";
    return sha256Text(canonicalJson(copy)).then(function (hash) {
      if (hash === stored) {
        return { ok: true, hash: hash };
      }
      return { ok: false, hash: hash, stored: stored, reason: "Canonical hash does not match. The file was edited after it was sealed, or it used a different canonicalization." };
    });
  }

  function validate(doc) {
    var errors = [];
    var warnings = [];
    if (!isObject(doc)) {
      return { ok: false, errors: ["File is not a JSON object."], warnings: warnings };
    }
    if (doc.format !== FORMAT) {
      errors.push("format must be \"pol\".");
    }
    if (!doc.version) {
      errors.push("version is missing.");
    }
    if (!emptyToNull(doc.title)) {
      errors.push("title is required.");
    }
    if (!isObject(doc.work)) {
      warnings.push("No work object is present.");
    } else if (!doc.work.sha256) {
      warnings.push("The work was not hashed. The file records a story, not a binding to bytes.");
    }
    if (doc.biometrics && doc.biometrics.included && doc.biometrics.device_signed) {
      warnings.push("device_signed is true, but this viewer cannot verify a hardware signature in v0.1.");
    }
    if (doc.attestation && doc.attestation.signed) {
      warnings.push("A signature flag is set, but v0.1 does not verify cryptographic signatures.");
    }
    if (doc.location && doc.location.lat != null && (doc.location.lat < -90 || doc.location.lat > 90)) {
      errors.push("location.lat is out of range.");
    }
    return { ok: errors.length === 0, errors: errors, warnings: warnings };
  }

  function parsePolText(text) {
    var doc;
    try {
      doc = JSON.parse(text);
    } catch (err) {
      return Promise.resolve({
        ok: false,
        doc: null,
        validation: { ok: false, errors: ["Not valid JSON."], warnings: [] },
        integrity: { ok: false, reason: "Could not parse." }
      });
    }
    var validation = validate(doc);
    return verifyIntegrity(doc).then(function (integrity) {
      return { ok: validation.ok, doc: doc, validation: validation, integrity: integrity };
    });
  }

  function downloadPol(doc, filename) {
    var pretty = JSON.stringify(doc, null, 2);
    var blob = new Blob([pretty], { type: "application/json" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename || slugFilename(doc.title);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function renderList(items) {
    if (!items || !items.length) {
      return "None recorded";
    }
    return items.map(escapeHtml).join(", ");
  }

  function renderRecordHtml(doc, extras) {
    extras = extras || {};
    var integrity = extras.integrity || {};
    var validation = extras.validation || validate(doc);
    var sealClass = integrity.ok ? "pass" : "fail";
    var sealText = integrity.ok ? "Integrity hash matches" : "Integrity hash missing or mismatched";
    if (!doc.integrity || !doc.integrity.canonical_sha256) {
      sealClass = "warn";
      sealText = "Unsealed file";
    }

    var creator = doc.creator || {};
    var created = doc.created || {};
    var work = doc.work || {};
    var effort = doc.effort || {};
    var bio = doc.biometrics;
    var loc = doc.location;
    var att = doc.attestation || {};
    var who = [creator.name, creator.handle].filter(Boolean).join(" · ") || "Anonymous human";

    var bioHtml = "<p>No biometric summary was included. That is the default, and the honest one unless a person chose to add it.</p>";
    if (bio && bio.included) {
      var hr = bio.heart_rate || {};
      var sweat = bio.sweat_or_skin_conductance || {};
      bioHtml =
        "<p>These numbers are <strong>" + (bio.device_signed ? "marked device-signed (not verified by this viewer)" : "self-attested") + "</strong>. They are not a lie detector.</p>" +
        "<dl class=\"pol-dl\">" +
        "<dt>Source</dt><dd>" + escapeHtml(bio.source || "manual") + (bio.device ? " · " + escapeHtml(bio.device) : "") + "</dd>" +
        "<dt>Heart rate</dt><dd>" + (hr.samples || hr.min != null ? escapeHtml([
          hr.min != null ? "min " + hr.min : "",
          hr.avg != null ? "avg " + hr.avg : "",
          hr.max != null ? "max " + hr.max : "",
          hr.samples != null ? hr.samples + " samples" : ""
        ].filter(Boolean).join(" · ")) : "Not recorded") + "</dd>" +
        "<dt>Steps</dt><dd>" + (bio.steps != null ? escapeHtml(bio.steps) : "Not recorded") + "</dd>" +
        "<dt>Active minutes</dt><dd>" + (bio.active_minutes != null ? escapeHtml(bio.active_minutes) : "Not recorded") + "</dd>" +
        "<dt>Sweat / GSR</dt><dd>" + escapeHtml(sweat.note || sweat.value != null ? [sweat.value != null ? sweat.value + (sweat.unit ? " " + sweat.unit : "") : "", sweat.note].filter(Boolean).join(" — ") : "Not recorded") + "</dd>" +
        "<dt>Samples</dt><dd>" + escapeHtml(bio.sample_count || 0) + "</dd>" +
        "</dl>" +
        (bio.note ? "<p>" + escapeHtml(bio.note) + "</p>" : "");
    }

    var warnHtml = "";
    if (validation.errors && validation.errors.length) {
      warnHtml += "<p class=\"pol-status err\">" + validation.errors.map(escapeHtml).join(" ") + "</p>";
    }
    if (validation.warnings && validation.warnings.length) {
      warnHtml += "<p class=\"pol-status warn\">" + validation.warnings.map(escapeHtml).join(" ") + "</p>";
    }
    if (integrity.reason && !integrity.ok) {
      warnHtml += "<p class=\"pol-status err\">" + escapeHtml(integrity.reason) + "</p>";
    }

    return (
      "<article class=\"pol-record\">" +
      "<div class=\"kicker\">Lived experience record · .pol " + escapeHtml(doc.version || "") + "</div>" +
      "<h2>" + escapeHtml(doc.title || "Untitled work") + "</h2>" +
      "<p class=\"sub\">" + escapeHtml(who) + "</p>" +
      "<span class=\"pol-seal " + sealClass + "\">" + escapeHtml(sealText) + "</span>" +
      warnHtml +
      "<h3>Time</h3>" +
      "<dl class=\"pol-dl\">" +
      "<dt>Session start</dt><dd>" + escapeHtml(formatWhen(created.session_start)) + "</dd>" +
      "<dt>Session end</dt><dd>" + escapeHtml(formatWhen(created.session_end)) + "</dd>" +
      "<dt>Duration</dt><dd>" + escapeHtml(formatDuration(doc.duration_seconds)) + "</dd>" +
      "<dt>Sealed</dt><dd>" + escapeHtml(formatWhen(created.recorded_at)) + "</dd>" +
      "</dl>" +
      "<h3>Place</h3>" +
      (loc && (loc.label || loc.lat != null)
        ? "<dl class=\"pol-dl\">" +
          "<dt>Label</dt><dd>" + escapeHtml(loc.label || "Unlabeled point") + "</dd>" +
          "<dt>Coordinates</dt><dd>" + (loc.lat != null && loc.lon != null ? escapeHtml(loc.lat + ", " + loc.lon) + (loc.accuracy_m != null ? " ±" + loc.accuracy_m + " m" : "") : "Not included") + "</dd>" +
          "<dt>Source</dt><dd>" + escapeHtml(loc.source || "unknown") + "</dd>" +
          "</dl>"
        : "<p>No location was included.</p>") +
      "<h3>The work</h3>" +
      "<dl class=\"pol-dl\">" +
      "<dt>Type</dt><dd>" + escapeHtml(work.type || "other") + "</dd>" +
      "<dt>Filename</dt><dd>" + escapeHtml(work.filename || "Not attached") + "</dd>" +
      "<dt>Bytes</dt><dd>" + (work.bytes != null ? escapeHtml(work.bytes) : "Unknown") + "</dd>" +
      "<dt>SHA-256</dt><dd class=\"pol-hash\">" + escapeHtml(work.sha256 || "Not hashed") + "</dd>" +
      "<dt>Embedded</dt><dd>" + (work.embedded && work.embedded.data ? "Yes (" + escapeHtml(work.embedded.media_type || "unknown") + ")" : "Hash and name only") + "</dd>" +
      "</dl>" +
      (work.note ? "<p>" + escapeHtml(work.note) + "</p>" : "") +
      "<h3>Effort</h3>" +
      "<dl class=\"pol-dl\">" +
      "<dt>Hours</dt><dd>" + (effort.hours != null ? escapeHtml(effort.hours) : "Not recorded") + "</dd>" +
      "<dt>Drafts</dt><dd>" + (effort.drafts != null ? escapeHtml(effort.drafts) : "Not recorded") + "</dd>" +
      "<dt>Tools</dt><dd>" + renderList(effort.tools) + "</dd>" +
      "<dt>With</dt><dd>" + renderList(effort.collaborators) + "</dd>" +
      "</dl>" +
      (effort.narrative ? "<p>" + escapeHtml(effort.narrative) + "</p>" : "") +
      (effort.what_was_hard ? "<p><em>What was hard.</em> " + escapeHtml(effort.what_was_hard) + "</p>" : "") +
      (effort.interruptions ? "<p><em>Interruptions.</em> " + escapeHtml(effort.interruptions) + "</p>" : "") +
      "<h3>Attestation</h3>" +
      "<p>" + escapeHtml(att.statement || DEFAULT_ATTESTATION) + "</p>" +
      "<h3>Body signals</h3>" +
      bioHtml +
      "<h3>Integrity</h3>" +
      "<p class=\"pol-hash\">" + escapeHtml((doc.integrity && doc.integrity.canonical_sha256) || "—") + "</p>" +
      "<p>This hash only says the JSON has not been quietly rewritten since it was sealed. AI can invent every field. The value is the habit of recording lived process in a common container.</p>" +
      "</article>"
    );
  }

  function splitList(value) {
    return String(value || "").split(/[,;\n]/).map(function (item) {
      return item.trim();
    }).filter(Boolean);
  }

  function nowLocalInput() {
    var d = new Date();
    var pad = function (n) {
      return n < 10 ? "0" + n : String(n);
    };
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
  }

  function setStatus(el, kind, text) {
    if (!el) {
      return;
    }
    el.className = "pol-status" + (kind ? " " + kind : "");
    el.textContent = text || "";
  }

  function initCreator(root) {
    if (!root) {
      return;
    }

    var state = {
      workFile: null,
      workHash: null,
      workBytes: null,
      workEmbedded: null,
      location: null,
      csvSummary: null,
      csvSource: null
    };

    var title = root.querySelector("[name=title]");
    var creatorName = root.querySelector("[name=creator_name]");
    var creatorHandle = root.querySelector("[name=creator_handle]");
    var workType = root.querySelector("[name=work_type]");
    var workNote = root.querySelector("[name=work_note]");
    var workFile = root.querySelector("[name=work_file]");
    var embedWork = root.querySelector("[name=embed_work]");
    var sessionStart = root.querySelector("[name=session_start]");
    var sessionEnd = root.querySelector("[name=session_end]");
    var durationHours = root.querySelector("[name=duration_hours]");
    var drafts = root.querySelector("[name=drafts]");
    var tools = root.querySelector("[name=tools]");
    var collaborators = root.querySelector("[name=collaborators]");
    var interruptions = root.querySelector("[name=interruptions]");
    var hard = root.querySelector("[name=what_was_hard]");
    var narrative = root.querySelector("[name=narrative]");
    var attestation = root.querySelector("[name=attestation]");
    var includeBio = root.querySelector("[name=include_bio]");
    var bioDevice = root.querySelector("[name=bio_device]");
    var hrMin = root.querySelector("[name=hr_min]");
    var hrAvg = root.querySelector("[name=hr_avg]");
    var hrMax = root.querySelector("[name=hr_max]");
    var steps = root.querySelector("[name=steps]");
    var activeMin = root.querySelector("[name=active_minutes]");
    var sweatNote = root.querySelector("[name=sweat_note]");
    var csvInput = root.querySelector("[name=wearable_csv]");
    var locLabel = root.querySelector("[name=location_label]");
    var preview = root.querySelector("[data-pol-preview]");
    var previewJson = root.querySelector("[data-pol-json]");
    var fileStatus = root.querySelector("[data-pol-file-status]");
    var locStatus = root.querySelector("[data-pol-loc-status]");
    var csvStatus = root.querySelector("[data-pol-csv-status]");
    var formStatus = root.querySelector("[data-pol-form-status]");

    if (attestation && !attestation.value) {
      attestation.value = DEFAULT_ATTESTATION;
    }

    function collectInput() {
      var durationSeconds = null;
      var hours = toNumber(durationHours && durationHours.value);
      if (hours != null) {
        durationSeconds = Math.round(hours * 3600);
      }

      var bio = { included: false };
      if (includeBio && includeBio.checked) {
        var hr = null;
        if (state.csvSummary && state.csvSummary.heart_rate) {
          hr = state.csvSummary.heart_rate;
        } else if (toNumber(hrMin && hrMin.value) != null || toNumber(hrAvg && hrAvg.value) != null || toNumber(hrMax && hrMax.value) != null) {
          hr = {
            min: toNumber(hrMin && hrMin.value),
            avg: toNumber(hrAvg && hrAvg.value),
            max: toNumber(hrMax && hrMax.value),
            samples: null
          };
        }
        var sweat = null;
        if (state.csvSummary && state.csvSummary.skin_conductance) {
          sweat = {
            value: state.csvSummary.skin_conductance.avg,
            unit: "unspecified",
            note: emptyToNull(sweatNote && sweatNote.value) || "Average of uploaded GSR/EDA column. Self-attested; not a clinical reading."
          };
        } else if (emptyToNull(sweatNote && sweatNote.value)) {
          sweat = { value: null, unit: null, note: sweatNote.value.trim() };
        }
        bio = {
          included: true,
          self_attested: true,
          device_signed: false,
          source: state.csvSource || "manual",
          device: emptyToNull(bioDevice && bioDevice.value),
          heart_rate: hr,
          steps: (state.csvSummary && state.csvSummary.steps != null) ? state.csvSummary.steps : toNumber(steps && steps.value),
          active_minutes: toNumber(activeMin && activeMin.value),
          sweat_or_skin_conductance: sweat,
          sample_count: state.csvSummary ? state.csvSummary.sample_count : 0
        };
      }

      var location = null;
      var label = emptyToNull(locLabel && locLabel.value);
      if (state.location) {
        location = {
          label: label || state.location.label,
          lat: state.location.lat,
          lon: state.location.lon,
          accuracy_m: state.location.accuracy_m,
          source: state.location.source
        };
      } else if (label) {
        location = { label: label, lat: null, lon: null, accuracy_m: null, source: "manual" };
      }

      return {
        title: title && title.value,
        creator: {
          name: creatorName && creatorName.value,
          handle: creatorHandle && creatorHandle.value
        },
        session_start: localInputToIso(sessionStart && sessionStart.value),
        session_end: localInputToIso(sessionEnd && sessionEnd.value),
        duration_seconds: durationSeconds,
        location: location,
        work: {
          type: (workType && workType.value) || "other",
          filename: state.workFile ? state.workFile.name : null,
          sha256: state.workHash,
          bytes: state.workBytes,
          note: workNote && workNote.value,
          embedded: (embedWork && embedWork.checked) ? state.workEmbedded : null
        },
        attestation: { statement: attestation && attestation.value },
        effort: {
          hours: hours,
          drafts: drafts && drafts.value,
          tools: splitList(tools && tools.value),
          interruptions: interruptions && interruptions.value,
          what_was_hard: hard && hard.value,
          narrative: narrative && narrative.value,
          collaborators: splitList(collaborators && collaborators.value)
        },
        biometrics: bio
      };
    }

    var previewTimer = null;
    function refreshPreview() {
      var doc = buildDocument(collectInput());
      if (preview) {
        preview.innerHTML = renderRecordHtml(doc, {
          integrity: { ok: false, reason: null },
          validation: validate(doc)
        });
        var seal = preview.querySelector(".pol-seal");
        if (seal) {
          seal.className = "pol-seal warn";
          seal.textContent = "Preview — not yet sealed";
        }
      }
      if (previewJson) {
        previewJson.textContent = JSON.stringify(doc, null, 2);
      }
    }

    function schedulePreview() {
      global.clearTimeout(previewTimer);
      previewTimer = global.setTimeout(refreshPreview, 180);
    }

    root.addEventListener("input", schedulePreview);
    root.addEventListener("change", schedulePreview);

    if (workFile) {
      workFile.addEventListener("change", function () {
        var file = workFile.files && workFile.files[0];
        state.workFile = file || null;
        state.workHash = null;
        state.workBytes = file ? file.size : null;
        state.workEmbedded = null;
        if (!file) {
          setStatus(fileStatus, "", "No file selected. You can still mint a .pol that records the making.");
          schedulePreview();
          return;
        }
        if (workType && workType.value === "other") {
          workType.value = guessWorkType(file);
        }
        setStatus(fileStatus, "", "Hashing " + file.name + " in this browser…");
        file.arrayBuffer().then(function (buffer) {
          return sha256Bytes(buffer).then(function (hash) {
            state.workHash = hash;
            state.workBytes = file.size;
            if (file.size <= EMBED_MAX_BYTES) {
              state.workEmbedded = {
                encoding: "base64",
                media_type: file.type || "application/octet-stream",
                data: bytesToBase64(new Uint8Array(buffer))
              };
              if (embedWork) {
                embedWork.disabled = false;
                embedWork.checked = true;
              }
              setStatus(fileStatus, "ok", "SHA-256 ready. File is small enough to embed if you leave embedding on.");
            } else {
              state.workEmbedded = null;
              if (embedWork) {
                embedWork.checked = false;
                embedWork.disabled = true;
              }
              setStatus(fileStatus, "ok", "SHA-256 ready. File is larger than 256 KiB, so only the filename and hash will be stored.");
            }
            schedulePreview();
          });
        }).catch(function () {
          setStatus(fileStatus, "err", "Could not hash that file in this browser.");
        });
      });
    }

    var startBtn = root.querySelector("[data-pol-start]");
    var endBtn = root.querySelector("[data-pol-end]");
    if (startBtn && sessionStart) {
      startBtn.addEventListener("click", function () {
        sessionStart.value = nowLocalInput();
        schedulePreview();
      });
    }
    if (endBtn && sessionEnd) {
      endBtn.addEventListener("click", function () {
        sessionEnd.value = nowLocalInput();
        if (sessionStart && sessionStart.value && durationHours) {
          var a = parseIso(sessionStart.value);
          var b = parseIso(sessionEnd.value);
          if (a && b) {
            durationHours.value = String(Math.round(((b.getTime() - a.getTime()) / 3600000) * 100) / 100);
          }
        }
        schedulePreview();
      });
    }

    var locBtn = root.querySelector("[data-pol-locate]");
    var locClear = root.querySelector("[data-pol-locate-clear]");
    if (locBtn) {
      locBtn.addEventListener("click", function () {
        if (!navigator.geolocation) {
          setStatus(locStatus, "err", "This browser does not offer geolocation.");
          return;
        }
        setStatus(locStatus, "", "Asking this device for a location. Nothing is sent to a server.");
        navigator.geolocation.getCurrentPosition(function (pos) {
          state.location = {
            label: emptyToNull(locLabel && locLabel.value),
            lat: Math.round(pos.coords.latitude * 1e6) / 1e6,
            lon: Math.round(pos.coords.longitude * 1e6) / 1e6,
            accuracy_m: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
            source: "browser_geolocation"
          };
          setStatus(locStatus, "ok", "Location added from this device. Clear it if you do not want coordinates in the file.");
          schedulePreview();
        }, function (err) {
          var msg = "Location was not added.";
          if (err && err.code === 1) {
            msg = "Permission denied. That is fine. You can type a place name instead, or include nothing.";
          }
          setStatus(locStatus, "warn", msg);
        }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 0 });
      });
    }
    if (locClear) {
      locClear.addEventListener("click", function () {
        state.location = null;
        if (locLabel) {
          locLabel.value = "";
        }
        setStatus(locStatus, "", "Location cleared. The file will not include a place unless you add one again.");
        schedulePreview();
      });
    }

    if (csvInput) {
      csvInput.addEventListener("change", function () {
        var file = csvInput.files && csvInput.files[0];
        if (!file) {
          state.csvSummary = null;
          state.csvSource = null;
          setStatus(csvStatus, "", "");
          schedulePreview();
          return;
        }
        file.text().then(function (text) {
          var parsed = parseWearableCsv(text);
          if (parsed.error) {
            state.csvSummary = null;
            state.csvSource = null;
            setStatus(csvStatus, "err", parsed.error);
            return;
          }
          state.csvSummary = summarizeWearableRows(parsed.rows);
          state.csvSource = "csv_upload";
          if (includeBio) {
            includeBio.checked = true;
          }
          if (state.csvSummary.heart_rate) {
            if (hrMin) {
              hrMin.value = state.csvSummary.heart_rate.min;
            }
            if (hrAvg) {
              hrAvg.value = state.csvSummary.heart_rate.avg;
            }
            if (hrMax) {
              hrMax.value = state.csvSummary.heart_rate.max;
            }
          }
          if (steps && state.csvSummary.steps != null) {
            steps.value = state.csvSummary.steps;
          }
          setStatus(csvStatus, "ok", "Summarized " + state.csvSummary.sample_count + " rows in this browser. Raw samples are not stored — only the summary you see.");
          schedulePreview();
        }).catch(function () {
          setStatus(csvStatus, "err", "Could not read that CSV.");
        });
      });
    }

    var mintBtn = root.querySelector("[data-pol-download]");
    if (mintBtn) {
      mintBtn.addEventListener("click", function () {
        if (!title || !String(title.value).trim()) {
          setStatus(formStatus, "err", "Name the work first.");
          if (title) {
            title.focus();
          }
          return;
        }
        mintBtn.disabled = true;
        setStatus(formStatus, "", "Sealing a canonical hash in this browser…");
        sealIntegrity(buildDocument(collectInput())).then(function (doc) {
          downloadPol(doc, slugFilename(doc.title));
          if (preview) {
            preview.innerHTML = renderRecordHtml(doc, {
              integrity: { ok: true, hash: doc.integrity.canonical_sha256 },
              validation: validate(doc)
            });
          }
          if (previewJson) {
            previewJson.textContent = JSON.stringify(doc, null, 2);
          }
          setStatus(formStatus, "ok", "Downloaded " + slugFilename(doc.title) + ". Nothing was uploaded. Keep the file with the work it describes.");
        }).catch(function () {
          setStatus(formStatus, "err", "Could not seal the file. This page needs a browser with Web Crypto (almost all current ones).");
        }).then(function () {
          mintBtn.disabled = false;
        });
      });
    }

    refreshPreview();
  }

  function showParsed(target, parsed) {
    if (!target) {
      return;
    }
    if (!parsed.doc) {
      target.innerHTML = "<p class=\"pol-status err\">" + escapeHtml((parsed.validation.errors || []).join(" ") || "Could not read that file.") + "</p>";
      return;
    }
    target.innerHTML = renderRecordHtml(parsed.doc, parsed);
    var raw = document.createElement("pre");
    raw.className = "pol-raw";
    raw.textContent = JSON.stringify(parsed.doc, null, 2);
    target.appendChild(raw);
  }

  function initViewer(root) {
    if (!root) {
      return;
    }
    var input = root.querySelector("[name=pol_file]");
    var drop = root.querySelector("[data-pol-drop]");
    var out = root.querySelector("[data-pol-view]");
    var status = root.querySelector("[data-pol-view-status]");
    var exampleBtn = root.querySelector("[data-pol-example]");

    function loadText(text, label) {
      setStatus(status, "", "Checking " + (label || "file") + "…");
      parsePolText(text).then(function (parsed) {
        showParsed(out, parsed);
        if (!parsed.doc) {
          setStatus(status, "err", "That was not a readable .pol JSON document.");
          return;
        }
        if (parsed.integrity.ok) {
          setStatus(status, "ok", "Opened " + (label || parsed.doc.title) + ". Integrity hash matches.");
        } else {
          setStatus(status, "warn", (label || "File") + " opened. " + (parsed.integrity.reason || "Integrity could not be confirmed."));
        }
      });
    }

    function loadFile(file) {
      if (!file) {
        return;
      }
      file.text().then(function (text) {
        loadText(text, file.name);
      }).catch(function () {
        setStatus(status, "err", "Could not read that file as text.");
      });
    }

    if (input) {
      input.addEventListener("change", function () {
        loadFile(input.files && input.files[0]);
      });
    }

    if (drop) {
      ["dragenter", "dragover"].forEach(function (evt) {
        drop.addEventListener(evt, function (e) {
          e.preventDefault();
          drop.classList.add("is-over");
        });
      });
      ["dragleave", "drop"].forEach(function (evt) {
        drop.addEventListener(evt, function (e) {
          e.preventDefault();
          drop.classList.remove("is-over");
        });
      });
      drop.addEventListener("drop", function (e) {
        var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        loadFile(file);
      });
    }

    if (exampleBtn) {
      exampleBtn.addEventListener("click", function () {
        var href = exampleBtn.getAttribute("data-href") || "examples/whereisthelove.pol";
        setStatus(status, "", "Loading the illustrative example…");
        fetch(href).then(function (res) {
          if (!res.ok) {
            throw new Error("missing");
          }
          return res.text();
        }).then(function (text) {
          loadText(text, "whereisthelove.pol");
        }).catch(function () {
          setStatus(status, "err", "Could not fetch the example. If you opened this page as a local file, try the Open button and choose pol/examples/whereisthelove.pol, or serve the folder over http.");
        });
      });
    }
  }

  function boot() {
    Array.prototype.forEach.call(document.querySelectorAll("[data-pol-creator]"), initCreator);
    Array.prototype.forEach.call(document.querySelectorAll("[data-pol-viewer]"), initViewer);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }

  global.HumanRepositoryPol = {
    FORMAT: FORMAT,
    VERSION: VERSION,
    EMBED_MAX_BYTES: EMBED_MAX_BYTES,
    DEFAULT_ATTESTATION: DEFAULT_ATTESTATION,
    canonicalJson: canonicalJson,
    sha256Bytes: sha256Bytes,
    sha256Text: sha256Text,
    slugFilename: slugFilename,
    parseWearableCsv: parseWearableCsv,
    summarizeWearableRows: summarizeWearableRows,
    buildDocument: buildDocument,
    sealIntegrity: sealIntegrity,
    verifyIntegrity: verifyIntegrity,
    validate: validate,
    parsePolText: parsePolText,
    downloadPol: downloadPol,
    renderRecordHtml: renderRecordHtml
  };
})(window);
