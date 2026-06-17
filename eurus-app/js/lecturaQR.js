import { db, auth } from "./firebase-config.js";
import {
  collection, doc, getDoc, getDocs, updateDoc,
  query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { tienePermiso } from "./auth.js";

const el = id => document.getElementById(id);

let scanner         = null;
let escaneando      = false;
let eventoActivo    = null;
let checkpointSel   = null;
let participanteSel = null;
let logSesion       = [];
let qrDetectado     = false;
let usandoFrontal   = true;
let _capturando     = false;

// ─── Alerta ──────────────────────────────────────────────────────────────────
function alerta(tipo, msg) {
  const div = el("alerta");
  div.className = `alerta alerta-${tipo} show`;
  div.textContent = msg;
  setTimeout(() => div.classList.remove("show"), 5000);
}

// ─── Cargar eventos ──────────────────────────────────────────────────────────
async function cargarEventos() {
  dbg("INFO", "📋 Cargando eventos desde Firestore...");
  try {
    const snap = await getDocs(query(collection(db, "eventos_eurus"), orderBy("creadoEn", "desc")));
    dbg("INFO", "📋 Eventos recibidos: " + snap.docs.length);
    const sel  = el("sel-evento-qr");
    sel.innerHTML = '<option value="">— Selecciona un evento —</option>';
    snap.docs.forEach(d => {
      const ev  = d.data();
      const opt = document.createElement("option");
      opt.value = d.id;
      opt.textContent = ev.nombre;
      sel.appendChild(opt);
    });
    if (snap.docs.length === 0) {
      dbg("WARN", "⚠️ No hay eventos en la BD");
    }
  } catch (e) {
    console.error("[QR] Error al cargar eventos:", e);
    dbg("ERROR", "❌ Error al cargar eventos: " + (e.message || e));
    alerta("error", "Error al cargar eventos. Verifica conexión.");
  }
}

el("sel-evento-qr").addEventListener("change", async () => {
  const id = el("sel-evento-qr").value;
  if (!id) { eventoActivo = null; el("cp-section").style.display = "none"; return; }
  const snap = await getDoc(doc(db, "eventos_eurus", id));
  if (!snap.exists()) return;
  eventoActivo = { id, ...snap.data() };
  renderCheckpoints();
  el("cp-section").style.display = "block";
});

function renderCheckpoints() {
  const cps = eventoActivo?.checkpoints || [];
  const grid = el("cp-grid");
  grid.innerHTML = cps.map(cp => `
    <div class="cp-card" data-id="${cp.id}" data-nombre="${cp.nombre}" onclick="seleccionarCP(this)">
      ${cp.nombre}
    </div>`).join("");
}

window.seleccionarCP = function(card) {
  if (card.classList.contains("ya-marcado")) return;
  document.querySelectorAll(".cp-card").forEach(c => c.classList.remove("selected"));
  card.classList.add("selected");
  checkpointSel = { id: card.dataset.id, nombre: card.dataset.nombre };
  el("cp-seleccionado").textContent = `Checkpoint activo: ${checkpointSel.nombre}`;
};

function dbg(type, msg) {
  console.log("[" + type + "]", msg);
  if (window.debugLog) window.debugLog(type, msg);
}

// ─── Scanner ─────────────────────────────────────────────────────────────────
async function iniciarCamara() {
  if (!eventoActivo) { alerta("error", "Selecciona un evento."); return; }
  if (!checkpointSel) { alerta("error", "Selecciona un checkpoint."); return; }

  const facingMode = usandoFrontal ? "user" : "environment";
  dbg("INFO", "📷 Iniciando cámara " + (usandoFrontal ? "frontal" : "trasera"));

  if (scanner) { try { await scanner.clear(); } catch (_) {} }
  scanner = new Html5Qrcode("reader");

  try {
    let frameCount = 0;
    let lastDbgFrame = 0;
    await scanner.start(
      { facingMode },
      { fps: 20, useBarCodeDetectorIfSupported: true },
      onScanExito,
      err => {
        frameCount++;
        if (frameCount - lastDbgFrame >= 30) {
          lastDbgFrame = frameCount;
          dbg("SCAN", "🔍 Escaneando (" + frameCount + " frames)");
        }
        if (err && !err.includes("No MultiFormat Readers")) console.warn("[QR] Error de frame:", err);
      }
    );
    escaneando = true;
    el("btn-iniciar").style.display = "none";
    el("btn-detener").style.display = "inline-flex";
    el("btn-capturar").style.display = "inline-flex";
    el("btn-cambiar-camara").style.display = "inline-flex";
    el("scanner-activo").classList.add("activo");
    dbg("OK", "✅ Cámara iniciada correctamente");
  } catch (e) {
    console.error("[QR] Error al iniciar cámara:", e);
    dbg("ERROR", "❌ Error cámara: " + e.message);
    alerta("error", "No se pudo iniciar la cámara " + (usandoFrontal ? "frontal" : "trasera") + ": " + e.message);
  }
}

el("btn-iniciar").addEventListener("click", iniciarCamara);

async function detenerCamara() {
  if (scanner) {
    try { await scanner.stop(); } catch (_) {}
    try { await scanner.clear(); } catch (_) {}
    scanner = null;
  }
  escaneando = false;
  el("btn-iniciar").style.display = "inline-flex";
  el("btn-detener").style.display = "none";
  el("btn-capturar").style.display = "none";
  el("btn-cambiar-camara").style.display = "none";
  el("scanner-activo").classList.remove("activo");
  dbg("INFO", "⏹ Cámara detenida");
}

el("btn-detener").addEventListener("click", detenerCamara);

async function cambiarCamara() {
  if (scanner) {
    try { await scanner.clear(); } catch (_) {}
    scanner = null;
  }
  escaneando = false;
  el("btn-capturar").style.display = "none";
  el("btn-cambiar-camara").style.display = "none";

  usandoFrontal = !usandoFrontal;
  dbg("INFO", "🔄 Cambiando a cámara " + (usandoFrontal ? "frontal" : "trasera"));
  await iniciarCamara();
}

el("btn-cambiar-camara").addEventListener("click", cambiarCamara);

// ─── Escaneo exitoso ─────────────────────────────────────────────────────────
async function onScanExito(inscripcionId) {
  if (!escaneando) return;
  if (!checkpointSel) {
    alerta("error", "Selecciona un checkpoint antes de escanear.");
    return;
  }
  if (el("resultado-box").style.display === "block") return;

  dbg("DETECT", "🎯 QR detectado! ID: " + inscripcionId);
  qrDetectado = true;

  try {
    await scanner.pause();

    const snap = await getDoc(doc(db, "inscripciones_eurus", inscripcionId));
    if (!snap.exists()) {
      dbg("WARN", "⚠️ Participante NO encontrado en BD: " + inscripcionId);
      alerta("error", "QR no reconocido. Participante no encontrado.");
      await scanner.resume();
      return;
    }

    const p = { id: inscripcionId, ...snap.data() };
    dbg("OK", "✅ Participante encontrado: " + p.nombre);

    if (p.eventoId !== eventoActivo.id) {
      dbg("WARN", "⚠️ QR de otro evento: " + (p.eventoNombre || "?"));
      alerta("error", `Este QR pertenece a otro evento (${p.eventoNombre || "desconocido"}).`);
      await scanner.resume();
      return;
    }

    participanteSel = p;
    mostrarInfoParticipante(p);
  } catch (e) {
    console.error("[QR] Error al procesar escaneo:", e);
    dbg("ERROR", "❌ Error al procesar QR: " + e.message);
    alerta("error", "Error al procesar QR. Intenta de nuevo.");
    if (scanner && escaneando) await scanner.resume();
  }
}

function mostrarInfoParticipante(p) {
  el("res-nombre").textContent      = p.nombre;
  el("res-correo").textContent      = p.correo;
  el("res-cedula").textContent      = p.cedula || "—";
  el("res-universidad").textContent = p.universidad || "—";
  el("res-carrera").textContent     = p.carrera || "—";

  const asis     = p.asistencias || {};
  const yaMarcado = asis[checkpointSel.id];

  console.log("[QR] Checkpoint actual:", checkpointSel.id, checkpointSel.nombre);
  console.log("[QR] Asistencias del participante:", asis);
  console.log("[QR] Ya marcado?", yaMarcado);

  const badge = el("res-estado-badge");
  if (yaMarcado) {
    badge.className = "estado-badge estado-err";
    badge.textContent = `⚠️ Ya registrado en "${checkpointSel.nombre}"`;
    el("btn-confirmar-asistencia").disabled = true;
  } else {
    badge.className = "estado-badge estado-ok";
    badge.textContent = `✅ Listo para marcar: ${checkpointSel.nombre}`;
    el("btn-confirmar-asistencia").disabled = false;
  }

  const totalCPs  = (eventoActivo.checkpoints || []).length;
  const marcados  = Object.keys(asis).map(k => {
    const cp = eventoActivo.checkpoints.find(c => c.id === k);
    return cp ? cp.nombre : k;
  });
  el("res-asistencias-actuales").textContent = marcados.length
    ? `Checkpoints previos (${marcados.length}/${totalCPs}): ${marcados.join(", ")}`
    : "Sin asistencias registradas aún.";

  el("resultado-box").style.display = "block";
  el("resultado-box").scrollIntoView({ behavior: "smooth", block: "nearest" });
  console.log("[QR] Información mostrada para:", p.nombre);
}

el("btn-confirmar-asistencia").addEventListener("click", async () => {
  if (!participanteSel || !checkpointSel) return;
  el("btn-confirmar-asistencia").disabled = true;
  el("btn-confirmar-asistencia").textContent = "Guardando...";

  const nuevaAsis = {
    marcadoEn:   serverTimestamp(),
    marcadoPor:  auth.currentUser?.uid || "desconocido",
    checkpoint:  checkpointSel.nombre,
  };

  const nuevaAsistencias = { ...(participanteSel.asistencias || {}), [checkpointSel.id]: nuevaAsis };
  const nuevoTotal = Object.keys(nuevaAsistencias).length;

  try {
    await updateDoc(doc(db, "inscripciones_eurus", participanteSel.id), {
      [`asistencias.${checkpointSel.id}`]: nuevaAsis,
      totalAsistencias: nuevoTotal,
      estado: "presente",
      actualizadoEn: serverTimestamp(),
    });

    // Agregar al log de sesión
    const ahora = new Date();
    logSesion.unshift({
      nombre:     participanteSel.nombre,
      checkpoint: checkpointSel.nombre,
      hora:       ahora.toLocaleTimeString("es-PA"),
    });
    renderLog();
    dbg("OK", "✅ Asistencia guardada: " + participanteSel.nombre + " en " + checkpointSel.nombre);
    alerta("success", `✅ Asistencia confirmada: ${participanteSel.nombre}`);

    // Marcar visualmente el checkpoint como ya marcado para esta persona
    marcarCPYaMarcado(checkpointSel.id);
  } catch (e) {
    alerta("error", "Error al guardar: " + e.message);
  }

  cerrarResultado();
});

el("btn-cancelar-scan").addEventListener("click", cerrarResultado);

async function cerrarResultado() {
  participanteSel = null;
  qrDetectado = false;
  el("resultado-box").style.display = "none";
  el("btn-confirmar-asistencia").disabled = false;
  el("btn-confirmar-asistencia").textContent = "✅ Confirmar asistencia";
  if (scanner && escaneando) {
    await scanner.resume();
  } else if (!scanner && !escaneando) {
    // El scanner fue detenido por capturarFoto — reiniciarlo
    await iniciarCamara();
  }
}

function marcarCPYaMarcado(cpId) {
  // Visual feedback: el checkpoint queda como "ya marcado" en la sesión para esta persona
  // (no es permanente — sirve como guía visual al operador)
}

// ─── Log ─────────────────────────────────────────────────────────────────────
function renderLog() {
  const tb = el("log-recientes");
  if (!logSesion.length) { tb.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--gris-medio)">Sin registros aún</td></tr>`; return; }
  tb.innerHTML = logSesion.slice(0, 20).map(entry => `
    <tr>
      <td>${entry.nombre}</td>
      <td>${entry.checkpoint}</td>
      <td>${entry.hora}</td>
    </tr>`).join("");
}

// ─── QR de prueba ────────────────────────────────────────────────────────────
el("btn-test-qr").addEventListener("click", async () => {
  const wrap = el("test-qr-wrap");
  wrap.style.display = "block";
  wrap.innerHTML = "";
  const testId = "TEST-" + Date.now();
  new QRCode(wrap, {
    text: testId,
    width: 240,
    height: 240,
    colorDark: "#000000",
    colorLight: "#ffffff",
    correctLevel: QRCode.CorrectLevel.H,
  });
  const p = document.createElement("p");
  p.style.marginTop = "8px";
  p.style.fontSize = "12px";
  p.style.color = "var(--gris-medio)";
  p.innerHTML = `Texto del QR: <code>${testId}</code><br><br>
    <strong>Para probar con cámara:</strong> muestra este QR en <strong>otro dispositivo</strong> (teléfono) y apunta la cámara.<br>
    <strong>Para probar sin dos dispositivos:</strong> toma un <strong>captura de pantalla</strong> y súbela con "📁 Escanear desde imagen"`;
  wrap.appendChild(p);
  console.log("[QR] QR de prueba generado con texto:", testId);
});

// ─── Escanear desde archivo ──────────────────────────────────────────────────
el("input-scan-file").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const tempScanner = new Html5Qrcode("reader");
    const result = await tempScanner.scanFileV2(file, true);
    console.log("[QR] Escaneo desde archivo exitoso:", result);
    onScanExito(result.decodedText);
  } catch (err) {
    console.error("[QR] Error escaneando archivo:", err);
    alerta("error", "No se pudo leer el QR de la imagen: " + err);
  }
  el("input-scan-file").value = "";
});

// ─── Capturar foto desde cámara ─────────────────────────────────────────────
el("btn-capturar").addEventListener("click", capturarFoto);

async function capturarFoto() {
  if (!scanner || !escaneando) return;
  if (!checkpointSel) { alerta("error", "Selecciona un checkpoint."); return; }
  if (el("resultado-box").style.display === "block") return;
  if (_capturando) return;
  _capturando = true;

  // Detener el scanner actual para liberar la cámara
  if (scanner) {
    try { await scanner.stop(); } catch (_) {}
    try { await scanner.clear(); } catch (_) {}
    scanner = null;
  }
  escaneando = false;
  el("btn-iniciar").style.display = "inline-flex";
  el("btn-detener").style.display = "none";
  el("btn-capturar").style.display = "none";

  dbg("INFO", "📸 Abriendo cámara nativa para foto...");
  el("input-camera-native").value = "";
  el("input-camera-native").click();
}

// ─── Escanear foto desde cámara nativa ───────────────────────────────────────
el("input-camera-native").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) {
    // Usuario canceló — reiniciar scanner
    _capturando = false;
    await iniciarCamara();
    return;
  }

  dbg("INFO", "📸 Foto nativa: " + (file.size / 1024).toFixed(1) + "KB");
  el("input-camera-native").value = "";

  // Mostrar preview
  const previewUrl = URL.createObjectURL(file);
  el("capture-preview").src = previewUrl;
  el("capture-preview-wrap").style.display = "block";

  let tempScanner, tempDiv;
  try {
    tempDiv = document.createElement("div");
    tempDiv.id = "temp-native-" + Date.now();
    tempDiv.style.display = "none";
    document.body.appendChild(tempDiv);
    tempScanner = new Html5Qrcode(tempDiv.id);
    const result = await Promise.race([
      tempScanner.scanFileV2(file, false),
      new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 12000))
    ]);
    tempScanner.clear();
    tempDiv.remove();
    tempScanner = null;
    tempDiv = null;

    dbg("DETECT", "🎯 QR detectado: " + result.decodedText);
    const inscripcionId = result.decodedText;
    qrDetectado = true;

    const snap = await getDoc(doc(db, "inscripciones_eurus", inscripcionId));
    if (!snap.exists()) {
      alerta("error", "QR no reconocido. Participante no encontrado.");
      qrDetectado = false;
      _capturando = false;
      await iniciarCamara();
      return;
    }

    const p = { id: inscripcionId, ...snap.data() };
    dbg("OK", "✅ Participante: " + p.nombre);

    if (p.eventoId !== eventoActivo.id) {
      alerta("error", "Este QR pertenece a otro evento (" + (p.eventoNombre || "?") + ").");
      qrDetectado = false;
      _capturando = false;
      await iniciarCamara();
      return;
    }

    participanteSel = p;
    mostrarInfoParticipante(p);
  } catch (e) {
    if (tempScanner) { try { tempScanner.clear(); } catch (_) {} }
    if (tempDiv && tempDiv.parentNode) tempDiv.remove();
    const errMsg = (typeof e === "string") ? e : (e?.message || "");
    if (errMsg.includes("No MultiFormat Readers")) {
      dbg("WARN", "📸 QR no detectado en la foto");
      alerta("error", "QR no detectado. Asegura buena luz y que el QR se vea completo.");
    } else {
      console.error("[QR] Error escaneando foto:", e);
      dbg("ERROR", "❌ Error escaneando: " + (e.message || e));
      alerta("error", "Error al escanear: " + (e.message || e));
    }
  } finally {
    _capturando = false;
    if (!qrDetectado) {
      await iniciarCamara();
    }
  }
});

// ─── Esperar rol ──────────────────────────────────────────────────────────────
async function esperarRol() {
  for (let i = 0; i < 15; i++) {
    const rol = sessionStorage.getItem("rol");
    if (rol && tienePermiso(rol, "gestionar_inscripciones")) return true;
    if (i === 0) dbg("INFO", "⏳ Esperando autenticación...");
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
dbg("INFO", "📱 App iniciada — cargando eventos y verificando permisos");

// 1) Cargar eventos siempre (no depende de auth)
cargarEventos();

// 2) Verificar permisos (redirige si no tiene acceso, sin bloquear la carga)
esperarRol().then(ok => {
  if (!ok) {
    dbg("ERROR", "❌ Sin permisos — redirigiendo a dashboard");
    window.location.href = "dashboard.html";
  }
});
