// Intenta detectar cuál columna es el "nombre visible" del cliente,
// buscando headers que contengan palabras típicas. Si no encuentra
// ninguna coincidencia, usa la primera columna como respaldo.
const NAME_PATTERNS = [/cliente/i, /raz.n/i, /nombre/i];

export function pickNameColumn(headers) {
  for (const pattern of NAME_PATTERNS) {
    const found = headers.find((h) => pattern.test(h));
    if (found) return found;
  }
  return headers[0];
}

export function getDisplayHeader(header) {
  if (!header) return 'Vencimiento';
  let clean = String(header).trim().replace(/:+$/, '').trim();
  if (!clean || /^(_col_|columna\s*\d+|unnamed)/i.test(clean)) {
    return 'Vencimiento';
  }
  if (/^(vto\.?|venc\.?|f\.?\s*venc\.?|vencimiento)$/i.test(clean)) {
    return 'Vencimiento';
  }
  return clean;
}

// Columnas estrictas de SI/NO (marcas de verificación directas)
const STRICT_YES_NO_PATTERN = /^(papel(es)?|recibid[oa]|entregad[oa]|confirmad[oa]|completad[oa]|check|presentad[oa]|declarad[oa])$/i;

// Columnas híbridas que aceptan SI/NO o texto libre (ej. "Archivado por:", "Procesado por", etc.)
const HYBRID_PATTERN = /archiv|procesad|revisad|por:?$/i;

export function findVencimientoColumn(headers) {
  if (!headers || !headers.length) return null;
  const vtoPattern = /^(vto\.?|venc\.?|f\.?\s*venc\.?|vencimiento|vencimientos|dia\s*venc|vto\s*dia)$/i;
  let found = headers.find((h) => vtoPattern.test(String(h).trim()));
  if (found) return found;
  found = headers.find((h) => getDisplayHeader(h) === 'Vencimiento');
  if (found) return found;
  found = headers.find((h) => /venc|vto/i.test(String(h).trim()));
  return found || null;
}

// Columna real donde se guarda el encargado/asignado de cada cliente
// (distinto de "Presentado por:"/"Archivado por:", que son sellos de
// quién hizo una acción puntual, no quién es responsable del cliente).
export function findEncargadoColumn(headers) {
  if (!headers || !headers.length) return null;
  const pattern = /^encargad[oa]s?:?$/i;
  let found = headers.find((h) => pattern.test(String(h).trim()));
  if (found) return found;
  found = headers.find((h) => /encargad[oa]/i.test(String(h).trim()));
  return found || null;
}

export function findUserStampColumn(headers, type) {
  if (!headers || !headers.length) return null;
  const cleanType = String(type).toLowerCase();
  const pattern = cleanType.includes('present')
    ? /presentad[oa]\s*por/i
    : cleanType.includes('archiv')
    ? /archivad[oa]\s*por/i
    : /procesad[oa]\s*por/i;

  return headers.find((h) => pattern.test(String(h).trim())) || null;
}

// Distribution of clients sequentially (round-robin) per Vencimiento group
export function assignClientsSequentially(rows, vencimientoKey, teamUsers) {
  if (!rows || !rows.length) return [];
  const users = teamUsers && teamUsers.length > 0 ? teamUsers : ['Sin Asignar'];

  // Group rows by Vencimiento
  const groups = {};
  rows.forEach((row) => {
    const raw = vencimientoKey ? String(row[vencimientoKey] || '').trim() : 'Sin Vencimiento';
    const digits = raw.match(/\d+/);
    const dayKey = digits ? `Día ${parseInt(digits[0], 10)}` : raw || 'Sin Vencimiento';

    if (!groups[dayKey]) groups[dayKey] = [];
    groups[dayKey].push(row);
  });

  // Sort within each group by original row order (_row) and assign cyclically
  const assignedMap = new Map();
  Object.keys(groups).forEach((dayKey) => {
    const groupRows = groups[dayKey];
    groupRows.sort((a, b) => (a._row || 0) - (b._row || 0));

    groupRows.forEach((row, index) => {
      const assignedUser = users[index % users.length];
      assignedMap.set(row._row, assignedUser);
    });
  });

  return rows.map((r) => ({
    ...r,
    _assignedUser: assignedMap.get(r._row) || users[0],
  }));
}

export function getFieldType(header, currentValue) {
  const cleanHeader = String(header || '').trim();
  const v = String(currentValue ?? '').trim().toUpperCase();

  // Si la cabecera es un campo híbrido (ej. "Archivado por:", "Procesado por", etc.)
  if (HYBRID_PATTERN.test(cleanHeader)) {
    return 'hybrid';
  }

  // Si la cabecera es estrictamente de verificación (ej. "Papeles", "Recibido")
  if (STRICT_YES_NO_PATTERN.test(cleanHeader)) {
    return 'pure_yesno';
  }

  // Si el valor actual en la planilla es exactamente SI o NO, y la columna parece un checklist
  if ((v === 'SI' || v === 'SÍ' || v === 'NO') && /papel|recib|entreg|confirm|complet|check/i.test(cleanHeader)) {
    return 'pure_yesno';
  }

  // Para el resto de casillas: texto libre
  return 'text';
}

export function isYesNoColumn(header, currentValue) {
  const type = getFieldType(header, currentValue);
  return type === 'pure_yesno';
}

// Formatea etiquetas de período evitando redundancia si el nombre de la hoja (mes)
// ya contiene el año (ej. "Enero 2026" + "2026" -> "Enero 2026")
export function formatPeriodLabel(month, year) {
  if (!month) return year ? String(year) : '';
  if (!year) return String(month);

  const monthStr = String(month).trim();
  const yearStr = String(year).trim();

  if (monthStr.toLowerCase().includes(yearStr.toLowerCase())) {
    return monthStr;
  }

  return `${monthStr} ${yearStr}`;
}


