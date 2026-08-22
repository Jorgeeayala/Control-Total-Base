import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api } from '../api';
import {
  pickNameColumn,
  findEncargadoColumn,
  findVencimientoColumn,
  assignClientsSequentially,
  formatPeriodLabel,
} from '../utils';
import {
  ArrowLeft,
  Search,
  Loader2,
  AlertCircle,
  UserCog,
  Check,
  CheckCircle2,
  Calendar,
  Shuffle,
  Zap,
} from 'lucide-react';

const listVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.015 },
  },
};

const rowVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.15 } },
};

export default function AssignClients({ user, year, month, onBack }) {
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [savingRow, setSavingRow] = useState(null);
  const [savedRow, setSavedRow] = useState(null);

  const [selectedVencimiento, setSelectedVencimiento] = useState('todos');
  const [selectedStatus, setSelectedStatus] = useState('todos'); // 'todos' | 'sin_asignar' | nombre de usuario

  // Modo asignación rápida: elegís un usuario activo y después vas
  // tocando clientes -- cada toque lo asigna al toque, sin abrir ningún
  // selector. Pensado para asignar en bloque bien rápido.
  const [quickMode, setQuickMode] = useState(false);
  const [activeAssignee, setActiveAssignee] = useState(null);

  // Confirmación del reparto automático (round-robin), para no disparar
  // una escritura masiva por error con un solo toque.
  const [confirmingRoundRobin, setConfirmingRoundRobin] = useState(false);
  const [roundRobinScope, setRoundRobinScope] = useState('sin_asignar'); // 'sin_asignar' | 'todos'
  const [runningRoundRobin, setRunningRoundRobin] = useState(false);
  const [roundRobinProgress, setRoundRobinProgress] = useState(null); // { done, total }

  // No siempre participa TODO el equipo de un vencimiento puntual -- acá
  // se elige quiénes entran en el reparto de esta corrida en particular.
  // Arranca con todos marcados, y se puede destildar a quien no procesa
  // ese vencimiento.
  const [roundRobinParticipants, setRoundRobinParticipants] = useState([]);

  function toggleParticipant(u) {
    setRoundRobinParticipants((prev) =>
      prev.includes(u) ? prev.filter((p) => p !== u) : [...prev, u]
    );
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    Promise.all([api.readClients(year, month), api.listUsers()])
      .then(([data, users]) => {
        if (cancelled) return;
        setHeaders(data.headers || []);
        setRows(data.rows || []);
        setTeamUsers(users || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'No se pudo cargar la planilla');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const nameKey = useMemo(() => pickNameColumn(headers), [headers]);
  const encargadoCol = useMemo(() => findEncargadoColumn(headers), [headers]);
  const vencimientoKey = useMemo(() => findVencimientoColumn(headers), [headers]);

  const availableVencimientos = useMemo(() => {
    if (!vencimientoKey || !rows.length) return [];
    const set = new Set();
    rows.forEach((r) => {
      const raw = String(r[vencimientoKey] || '').trim();
      if (!raw) return;
      const digits = raw.match(/\d+/);
      set.add(digits ? String(parseInt(digits[0], 10)) : raw);
    });
    return Array.from(set).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [vencimientoKey, rows]);

  function getVencimientoDay(row) {
    if (!vencimientoKey) return 'Sin vencimiento';
    const raw = String(row[vencimientoKey] || '').trim();
    if (!raw) return 'Sin vencimiento';
    const digits = raw.match(/\d+/);
    return digits ? String(parseInt(digits[0], 10)) : raw;
  }

  const filteredRows = useMemo(() => {
    let list = [...rows].sort((a, b) =>
      String(a[nameKey] || '').localeCompare(String(b[nameKey] || ''), 'es', { sensitivity: 'base' })
    );

    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((r) => String(r[nameKey] || '').toLowerCase().includes(q));
    }

    if (selectedVencimiento !== 'todos' && vencimientoKey) {
      list = list.filter((r) => getVencimientoDay(r) === selectedVencimiento);
    }

    if (selectedStatus === 'sin_asignar') {
      list = list.filter((r) => !r[encargadoCol]);
    } else if (selectedStatus !== 'todos') {
      list = list.filter((r) => r[encargadoCol] === selectedStatus);
    }

    return list;
  }, [rows, nameKey, query, selectedVencimiento, vencimientoKey, selectedStatus, encargadoCol]);

  // Vista agrupada por vencimiento: se arma solo cuando tiene sentido
  // verla (viendo "Todos los vencimientos", sin buscar nada puntual) y
  // hay más de un grupo -- así se puede ver el ciclo del round-robin tal
  // cual lo aplica el algoritmo (ordenado por fila de la hoja, NO
  // alfabético, porque el reparto cíclico se basa en ese orden).
  const groupedByVencimiento = useMemo(() => {
    if (!vencimientoKey || selectedVencimiento !== 'todos' || query.trim()) return null;

    const groups = new Map();
    filteredRows.forEach((row) => {
      const day = getVencimientoDay(row);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(row);
    });

    if (groups.size <= 1) return null;

    const dayOrder = [...availableVencimientos, 'Sin vencimiento'];
    return dayOrder
      .filter((day) => groups.has(day))
      .map((day) => ({
        day,
        // Orden por fila de la hoja (no alfabético): es el mismo criterio
        // que usa assignClientsSequentially para el ciclo, así lo que se
        // ve acá coincide con cómo se reparte de verdad.
        rows: [...groups.get(day)].sort((a, b) => (a._row || 0) - (b._row || 0)),
      }));
  }, [filteredRows, vencimientoKey, selectedVencimiento, query, availableVencimientos]);

  const unassignedCount = useMemo(
    () => rows.filter((r) => !r[encargadoCol]).length,
    [rows, encargadoCol]
  );

  // Mismo conteo pero solo dentro de lo que está filtrado ahora (ej: si
  // filtraste "Día 7", cuenta sin asignar de ese día nomás) -- así el
  // número que se ve en el botón de reparto coincide con lo que en
  // realidad se va a repartir.
  const filteredUnassignedCount = useMemo(
    () => filteredRows.filter((r) => !r[encargadoCol]).length,
    [filteredRows, encargadoCol]
  );

  async function assignRow(row, newUser) {
    if (!encargadoCol) return;
    setSavingRow(row._row);
    try {
      await api.updateCell({
        year,
        sheet: month,
        user,
        row: row._row,
        column: encargadoCol,
        value: newUser,
      });
      setRows((prev) =>
        prev.map((r) => (r._row === row._row ? { ...r, [encargadoCol]: newUser } : r))
      );
      setSavedRow(row._row);
      setTimeout(() => setSavedRow((r) => (r === row._row ? null : r)), 1000);
    } catch (err) {
      setError(err.message || 'No se pudo guardar la asignación');
    } finally {
      setSavingRow(null);
    }
  }

  function handleRowClick(row) {
    if (quickMode && activeAssignee) {
      assignRow(row, activeAssignee);
    }
  }

  async function runRoundRobin() {
    if (!encargadoCol || !roundRobinParticipants.length) return;
    setRunningRoundRobin(true);
    setError('');
    try {
      // El scope parte de lo que ya está filtrado en pantalla (respeta el
      // filtro de Vencimiento activo: si estás viendo "Día 7", el reparto
      // es solo para Día 7, no para toda la planilla) y encima se aplica
      // "solo sin asignar" o "todos" según lo elegido.
      const baseScope = filteredRows;
      const targets =
        roundRobinScope === 'todos' ? baseScope : baseScope.filter((r) => !r[encargadoCol]);
      const suggestions = assignClientsSequentially(targets, vencimientoKey, roundRobinParticipants);
      const total = suggestions.length;
      setRoundRobinProgress({ done: 0, total });

      // Se manda en lotes chicos y SECUENCIALES (no todos de una) por dos
      // motivos: 1) un solo request gigante contra Apps Script puede
      // tardar muchísimo y se sentía "colgado" aunque en realidad seguía
      // trabajando; 2) así se puede mostrar progreso real ("120/395") en
      // vez de un spinner opaco sin información.
      const CHUNK_SIZE = 25;
      for (let i = 0; i < suggestions.length; i += CHUNK_SIZE) {
        const chunk = suggestions.slice(i, i + CHUNK_SIZE);

        await Promise.all(
          chunk.map((row) =>
            api.updateCell({
              year,
              sheet: month,
              user,
              row: row._row,
              column: encargadoCol,
              value: row._assignedUser,
            })
          )
        );
        // Fuerza a que ESTE lote salga ya (no espera a mezclarse con el
        // siguiente), así el progreso que se muestra es real, no
        // optimista solamente.
        await api.flushPendingSaves();

        const chunkMap = new Map(chunk.map((r) => [r._row, r._assignedUser]));
        setRows((prev) =>
          prev.map((r) => (chunkMap.has(r._row) ? { ...r, [encargadoCol]: chunkMap.get(r._row) } : r))
        );
        setRoundRobinProgress({ done: Math.min(i + CHUNK_SIZE, total), total });
      }

      setConfirmingRoundRobin(false);
    } catch (err) {
      setError(err.message || 'No se pudo repartir automáticamente');
    } finally {
      setRunningRoundRobin(false);
      setRoundRobinProgress(null);
    }
  }

  return (
    <div className="screen wide">
      <div className="screen-header">
        <motion.button
          className="back-btn"
          whileHover={{ scale: 1.04, x: -2 }}
          whileTap={{ scale: 0.95 }}
          onClick={onBack}
        >
          <ArrowLeft size={16} />
          <span>Volver</span>
        </motion.button>

        <div className="save-all-notice">
          <UserCog size={14} />
          <span>Asignar clientes · {formatPeriodLabel(month, year)}</span>
        </div>
      </div>

      {loading && (
        <div className="empty-state">
          <Loader2 size={28} className="animate-spin" />
          <p>Cargando clientes...</p>
        </div>
      )}

      {!loading && error && (
        <div className="empty-state">
          <AlertCircle size={28} style={{ color: 'var(--danger)' }} />
          <p>{error}</p>
        </div>
      )}

      {!loading && !error && !encargadoCol && (
        <div className="empty-state">
          <AlertCircle size={28} style={{ color: 'var(--danger)' }} />
          <p>
            Esta planilla todavía no tiene una columna <strong>"Encargado"</strong>.
            <br />
            Agregala en la hoja de {formatPeriodLabel(month, year)} para poder asignar clientes acá.
          </p>
        </div>
      )}

      {!loading && !error && encargadoCol && (
        <>
          <div className="assign-controls">
          {/* Toolbar: búsqueda + acciones masivas */}
          <div className="search-wrapper">
            <Search size={16} className="search-icon" />
            <input
              type="text"
              className="search-input"
              placeholder="Buscar cliente..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <div className="assign-toolbar">
            <motion.button
              className={`filter-pill ${quickMode ? 'active' : ''}`}
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setQuickMode((v) => !v);
                setActiveAssignee(null);
              }}
            >
              <Zap size={13} /> Asignación rápida
            </motion.button>

            <motion.button
              className="filter-pill"
              whileTap={{ scale: 0.96 }}
              onClick={() => {
                setRoundRobinParticipants(teamUsers);
                setConfirmingRoundRobin(true);
              }}
              disabled={!teamUsers.length}
            >
              <Shuffle size={13} /> Repartir automático
            </motion.button>
          </div>

          {/* Panel de confirmación del round-robin */}
          <AnimatePresence>
            {confirmingRoundRobin && (
              <motion.div
                className="assign-confirm-box"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <p>
                  Repartir <strong>{filteredRows.length} clientes</strong>
                  {selectedVencimiento !== 'todos' ? <> del Día {selectedVencimiento}</> : null}
                  {' '}en partes iguales, agrupando por vencimiento.
                </p>

                <p style={{ margin: '10px 0 2px', fontWeight: 600, color: 'var(--text-main)' }}>
                  Orden del reparto (el 1° es quien arranca el ciclo):
                </p>
                <div className="filter-pills" style={{ marginBottom: '8px', minHeight: '32px' }}>
                  {roundRobinParticipants.length === 0 && (
                    <span style={{ fontSize: '12px', color: 'var(--text-subtle)' }}>
                      Nadie elegido todavía -- tocá abajo para agregar.
                    </span>
                  )}
                  {roundRobinParticipants.map((u, i) => (
                    <button
                      key={u}
                      className="filter-pill active"
                      onClick={() => toggleParticipant(u)}
                      title="Tocar para sacar del reparto"
                    >
                      {i + 1}. {u} <X size={12} />
                    </button>
                  ))}
                </div>

                {roundRobinParticipants.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setRoundRobinParticipants(teamUsers)}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--primary)',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      padding: 0,
                      marginBottom: '10px',
                    }}
                  >
                    Restablecer orden por defecto
                  </button>
                )}

                {teamUsers.some((u) => !roundRobinParticipants.includes(u)) && (
                  <>
                    <p style={{ margin: '0 0 6px', fontSize: '12px', color: 'var(--text-subtle)' }}>
                      Agregar al reparto (se suman al final del orden):
                    </p>
                    <div className="filter-pills" style={{ marginBottom: '10px' }}>
                      {teamUsers
                        .filter((u) => !roundRobinParticipants.includes(u))
                        .map((u) => (
                          <button key={u} className="filter-pill" onClick={() => toggleParticipant(u)}>
                            + {u}
                          </button>
                        ))}
                    </div>
                  </>
                )}

                <div className="filter-pills" style={{ marginBottom: '10px' }}>
                  <button
                    className={`filter-pill ${roundRobinScope === 'sin_asignar' ? 'active' : ''}`}
                    onClick={() => setRoundRobinScope('sin_asignar')}
                  >
                    Solo sin asignar ({filteredUnassignedCount})
                  </button>
                  <button
                    className={`filter-pill ${roundRobinScope === 'todos' ? 'active' : ''}`}
                    onClick={() => setRoundRobinScope('todos')}
                  >
                    Reasignar todos ({filteredRows.length})
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <motion.button
                    type="button"
                    className="btn-primary"
                    whileTap={{ scale: 0.97 }}
                    onClick={runRoundRobin}
                    disabled={runningRoundRobin || !roundRobinParticipants.length}
                    style={{ padding: '8px 16px' }}
                  >
                    {runningRoundRobin ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                    <span>
                      {runningRoundRobin
                        ? roundRobinProgress
                          ? `Asignando ${roundRobinProgress.done}/${roundRobinProgress.total}...`
                          : 'Preparando...'
                        : !roundRobinParticipants.length
                        ? 'Elegí al menos un usuario'
                        : 'Confirmar reparto'}
                    </span>
                  </motion.button>
                  <button
                    type="button"
                    className="pill-btn"
                    onClick={() => setConfirmingRoundRobin(false)}
                    disabled={runningRoundRobin}
                  >
                    Cancelar
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Selector de usuario activo para asignación rápida */}
          <AnimatePresence>
            {quickMode && (
              <motion.div
                className="assign-confirm-box"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <p style={{ marginBottom: '8px' }}>
                  {activeAssignee ? (
                    <>Tocá clientes de la lista para asignarlos a <strong>{activeAssignee}</strong></>
                  ) : (
                    'Elegí a quién asignarle los clientes que toques:'
                  )}
                </p>
                <div className="filter-pills">
                  {teamUsers.map((u) => (
                    <button
                      key={u}
                      className={`filter-pill ${activeAssignee === u ? 'active' : ''}`}
                      onClick={() => setActiveAssignee(u)}
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Filtros: Vencimiento + Encargado, mismo patrón que la lista principal */}
          {vencimientoKey && availableVencimientos.length > 0 && (
            <div className="filter-row">
              <span className="filter-label">
                <Calendar size={14} /> Vencimiento:
              </span>
              <div className="filter-pills">
                <button
                  className={`filter-pill ${selectedVencimiento === 'todos' ? 'active' : ''}`}
                  onClick={() => setSelectedVencimiento('todos')}
                >
                  Todos
                </button>
                {availableVencimientos.map((day) => (
                  <button
                    key={day}
                    className={`filter-pill ${selectedVencimiento === day ? 'active' : ''}`}
                    onClick={() => setSelectedVencimiento(day)}
                  >
                    Día {day}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="filter-row">
            <span className="filter-label">
              <UserCog size={14} /> Estado:
            </span>
            <div className="filter-pills">
              <button
                className={`filter-pill ${selectedStatus === 'todos' ? 'active' : ''}`}
                onClick={() => setSelectedStatus('todos')}
              >
                Todos
              </button>
              <button
                className={`filter-pill ${selectedStatus === 'sin_asignar' ? 'active' : ''}`}
                onClick={() => setSelectedStatus('sin_asignar')}
              >
                Sin asignar ({unassignedCount})
              </button>
              {teamUsers.map((u) => (
                <button
                  key={u}
                  className={`filter-pill ${selectedStatus === u ? 'active' : ''}`}
                  onClick={() => setSelectedStatus(u)}
                >
                  {u}
                </button>
              ))}
            </div>
          </div>
          </div>

          <div className="stats-bar">
            <div className="stats-bar-count">
              <UserCog size={14} />
              <span>Mostrando</span>
              <span className="count-badge">{filteredRows.length} de {rows.length}</span>
            </div>
            {groupedByVencimiento && (
              <div className="stats-bar-tags">
                <span>Agrupado por vencimiento, en orden de reparto</span>
              </div>
            )}
          </div>

          {(() => {
            const renderRow = (row) => {
              const isAssignedToActive =
                quickMode && activeAssignee && row[encargadoCol] === activeAssignee;
              return (
                <motion.div
                  key={row._row}
                  className={`assign-row ${quickMode ? 'assign-row-quick' : ''} ${
                    isAssignedToActive ? 'assign-row-matched' : ''
                  }`}
                  variants={rowVariants}
                  onClick={() => handleRowClick(row)}
                  whileTap={quickMode && activeAssignee ? { scale: 0.98 } : undefined}
                >
                  <span className="assign-row-name">{row[nameKey] || 'Sin nombre'}</span>

                  <div className="assign-row-control" onClick={(e) => quickMode && e.stopPropagation()}>
                    {savingRow === row._row && <Loader2 size={15} className="animate-spin" />}
                    {savedRow === row._row && <Check size={15} style={{ color: 'var(--success)' }} />}
                    {isAssignedToActive && savingRow !== row._row && savedRow !== row._row && (
                      <CheckCircle2 size={16} style={{ color: '#16a34a' }} />
                    )}
                    {!quickMode && (
                      <select
                        className="sort-select"
                        value={row[encargadoCol] || ''}
                        disabled={savingRow === row._row}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => assignRow(row, e.target.value)}
                      >
                        <option value="">Sin asignar</option>
                        {teamUsers.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    )}
                    {quickMode && !isAssignedToActive && (
                      <span className="assign-row-current">{row[encargadoCol] || 'Sin asignar'}</span>
                    )}
                  </div>
                </motion.div>
              );
            };

            if (groupedByVencimiento) {
              return groupedByVencimiento.map((group) => (
                <div key={group.day} className="assign-group">
                  <div className="assign-group-header">
                    <Calendar size={13} />
                    <span>
                      {group.day === 'Sin vencimiento' ? 'Sin vencimiento' : `Día ${group.day}`}
                    </span>
                    <span className="assign-group-count">{group.rows.length}</span>
                  </div>
                  <motion.div
                    className="assign-list"
                    variants={listVariants}
                    initial="hidden"
                    animate="visible"
                  >
                    {group.rows.map(renderRow)}
                  </motion.div>
                </div>
              ));
            }

            return (
              <motion.div className="assign-list" variants={listVariants} initial="hidden" animate="visible">
                {filteredRows.map(renderRow)}
              </motion.div>
            );
          })()}
        </>
      )}
    </div>
  );
}
