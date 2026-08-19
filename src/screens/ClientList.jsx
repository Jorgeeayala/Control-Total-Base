import { useEffect, useMemo, useState, useRef, useCallback, memo, forwardRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { api } from '../api';
import {
  pickNameColumn,
  findVencimientoColumn,
  findUserStampColumn,
  assignClientsSequentially,
  getFieldType,
  getDisplayHeader,
  formatPeriodLabel,
} from '../utils';
import {
  Search,
  Plus,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  X,
  Users,
  CheckCircle2,
  XCircle,
  Calendar,
  Building2,
  Filter,
  ArrowUpDown,
  UserCheck,
  BarChart3,
  Archive,
  Award,
} from 'lucide-react';

const STORAGE_KEY_TEAM = 'app-team-users';

const itemVariants = {
  hidden: { opacity: 0, y: 14, scale: 0.98 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 350, damping: 25 },
  },
};

function useIsTouchDevice() {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    );
  });

  useEffect(() => {
    const checkTouch = () => {
      const touch =
        'ontouchstart' in window ||
        navigator.maxTouchPoints > 0 ||
        (window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
      setIsTouch(touch);
    };
    window.addEventListener('resize', checkTouch);
    return () => window.removeEventListener('resize', checkTouch);
  }, []);

  return isTouch;
}

const SwipeableClientCard = memo(forwardRef(function SwipeableClientCard({
  row,
  nameKey,
  vencimientoKey,
  presUser,
  archUser,
  presHeader,
  archHeader,
  presentadoPorCol,
  archivadoPorCol,
  isPresSi: initialIsPresSi,
  isArchSi: initialIsArchSi,
  statusHeaders,
  user: _user,
  onSelect,
  handleQuickToggle,
  getDisplayHeader,
  itemVariants,
  isTouchDevice,
  headers,
  dataIndex,
  virtualStyle,
}, ref) {
  const [localOverrides, setLocalOverrides] = useState({});
  const [dragX, setDragX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const isDraggingRef = useRef(false);

  // Sync / reset local overrides when row data updates from parent
  useEffect(() => {
    setLocalOverrides({});
  }, [row]);

  // Lock vertical page scroll while swiping a card on mobile
  useEffect(() => {
    if (!isSwiping) return;
    const preventScroll = (e) => {
      if (e.cancelable) {
        e.preventDefault();
      }
    };
    window.addEventListener('touchmove', preventScroll, { passive: false });
    return () => {
      window.removeEventListener('touchmove', preventScroll);
    };
  }, [isSwiping]);

  const clientName = row[nameKey] || 'Sin Nombre';
  const vtoValue = vencimientoKey ? String(row[vencimientoKey] || '').trim() : '';
  const assignedUser = row._assignedUser;

  const presColName = presHeader || presentadoPorCol || (headers || []).find((h) => /presentad/i.test(h)) || null;
  const archColName = archHeader || archivadoPorCol || (headers || []).find((h) => /archiv/i.test(h)) || null;

  // ¿La columna que se usa para Presentado/Archivado es EXCLUSIVAMENTE la
  // de "...Por" (ej. "Archivado por:"), sin una columna SI/NO separada?
  // Es el caso real de esta planilla: no existe "Presentado" ni "Archivado"
  // como columna aparte, solo "Archivado por:" (y ahora "Presentado por:").
  // En ese caso el estado NO es "SI"/"NO", es "¿tiene un nombre cargado o
  // está vacía?" -- y al marcar, lo que se escribe ahí es directamente el
  // nombre del usuario, no la palabra "SI".
  const presIsStampOnly = Boolean(presColName) && presColName === presentadoPorCol;
  const archIsStampOnly = Boolean(archColName) && archColName === archivadoPorCol;

  // Resolve values considering instant local optimistic state
  const getColValue = (col) => {
    if (!col) return '';
    if (localOverrides[col] !== undefined) return localOverrides[col];
    return String(row[col] || '').trim().toUpperCase();
  };

  const isPresSi = presColName
    ? presIsStampOnly
      ? getColValue(presColName) !== ''
      : (getColValue(presColName) === 'SI' || getColValue(presColName) === 'SÍ')
    : initialIsPresSi;

  const isArchSi = archColName
    ? archIsStampOnly
      ? getColValue(archColName) !== ''
      : (getColValue(archColName) === 'SI' || getColValue(archColName) === 'SÍ')
    : initialIsArchSi;

  // Valor a escribir al marcar/desmarcar: si la columna es "solo sello",
  // marcar = poner el nombre del usuario logueado; desmarcar = vaciarla.
  // Si hay una columna SI/NO real, se sigue usando 'SI'/'NO' como siempre.
  const nextPresValue = (marking) => (presIsStampOnly ? (marking ? _user : '') : (marking ? 'SI' : 'NO'));
  const nextArchValue = (marking) => (archIsStampOnly ? (marking ? _user : '') : (marking ? 'SI' : 'NO'));

  const onToggleClick = (e, colName, targetVal) => {
    if (e && e.stopPropagation) e.stopPropagation();
    // 0ms instant visual toggle locally
    setLocalOverrides((prev) => ({ ...prev, [colName]: targetVal }));
    // Asynchronous backend update
    handleQuickToggle(e, row, colName, targetVal);
  };

  const handleDragStart = () => {
    if (!isTouchDevice) return;
    isDraggingRef.current = true;
    setIsSwiping(true);
  };

  const handleDrag = (_e, info) => {
    if (!isTouchDevice) return;
    setDragX(info.offset.x);
  };

  const handleDragEnd = (e, info) => {
    if (!isTouchDevice) return;
    const offsetX = info.offset.x;
    const velocityX = info.velocity.x;
    const threshold = 70;

    if (offsetX > threshold || velocityX > 350) {
      // Swiped Right -> Toggle Presentado
      if (presColName) {
        onToggleClick(e, presColName, nextPresValue(!isPresSi));
      }
    } else if (offsetX < -threshold || velocityX < -350) {
      // Swiped Left -> Toggle Archivado
      if (archColName) {
        onToggleClick(e, archColName, nextArchValue(!isArchSi));
      }
    }

    setDragX(0);
    setIsSwiping(false);

    setTimeout(() => {
      isDraggingRef.current = false;
    }, 150);
  };

  const handleCardClick = () => {
    if (isDraggingRef.current || Math.abs(dragX) > 10) return;
    onSelect(row);
  };

  // Determine if Presentado / Archivado are in statusHeaders or need standalone quick toggles
  const hasPresInStatusHeaders = statusHeaders.some((sh) => /presentad/i.test(sh));
  const hasArchInStatusHeaders = statusHeaders.some((sh) => /archiv/i.test(sh));

  return (
    <motion.li
      ref={ref}
      data-index={dataIndex}
      className="swipe-card-wrapper"
      variants={itemVariants}
      style={{
        position: 'relative',
        overflow: 'hidden',
        borderRadius: 'var(--radius-md)',
        listStyle: 'none',
        userSelect: 'none',
        touchAction: isTouchDevice ? 'pan-y' : 'auto',
        ...virtualStyle,
      }}
    >
      {/* Background action indicators (ONLY on touch devices when dragging) */}
      {isTouchDevice && (
        <div
          className="swipe-action-bg"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: 'var(--radius-md)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 20px',
            fontWeight: 600,
            fontSize: '13px',
            backgroundColor:
              dragX > 15
                ? '#dcfce7'
                : dragX < -15
                ? '#f3e8ff'
                : 'var(--bg-card-hover)',
            transition: isSwiping ? 'none' : 'background-color 0.2s ease',
          }}
        >
          {/* Right swipe indicator (Left side) -> Presentado */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#15803d',
              opacity: dragX > 10 ? Math.min(dragX / 50, 1) : 0,
              transform: `scale(${dragX > 10 ? Math.min(0.85 + dragX / 250, 1.1) : 0.85})`,
              transition: isSwiping ? 'none' : 'all 0.2s ease',
            }}
          >
            <CheckCircle2 size={20} />
            <span>{isPresSi ? 'Quitar Presentado' : 'Marcar Presentado'}</span>
          </div>

          {/* Left swipe indicator (Right side) -> Archivado */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              color: '#6b21a8',
              opacity: dragX < -10 ? Math.min(-dragX / 50, 1) : 0,
              transform: `scale(${dragX < -10 ? Math.min(0.85 + -dragX / 250, 1.1) : 0.85})`,
              transition: isSwiping ? 'none' : 'all 0.2s ease',
            }}
          >
            <span>{isArchSi ? 'Quitar Archivado' : 'Marcar Archivado'}</span>
            <Archive size={20} />
          </div>
        </div>
      )}

      {/* Main Card (Draggable on mobile touch, static click target on PC) */}
      <motion.div
        className="client-card"
        drag={isTouchDevice ? 'x' : false}
        dragConstraints={isTouchDevice ? { left: 0, right: 0 } : undefined}
        dragElastic={isTouchDevice ? 0.6 : undefined}
        onDragStart={isTouchDevice ? handleDragStart : undefined}
        onDrag={isTouchDevice ? handleDrag : undefined}
        onDragEnd={isTouchDevice ? handleDragEnd : undefined}
        onClick={handleCardClick}
        whileHover={{ y: -1, transition: { duration: 0.15 } }}
        style={{
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'stretch',
          gap: '10px',
          backgroundColor: 'var(--bg-card)',
          touchAction: isTouchDevice ? 'pan-y' : 'auto',
          cursor: isTouchDevice ? (isSwiping ? 'grabbing' : 'grab') : 'pointer',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div className="client-info">
            <div className="client-avatar-default">
              <Building2 size={20} />
            </div>
            <div>
              <div className="client-name">{clientName}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '3px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                {vtoValue && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}>
                    <Calendar size={12} />
                    Vencimiento: <strong>{vtoValue}</strong>
                  </span>
                )}

                {assignedUser && (
                  <span className="assigned-user-badge">
                    <UserCheck size={11} />
                    Encargado: {assignedUser}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Indicador visual persistente de Presentado/Archivado -- se
              actualiza al instante (misma actualización optimista que
              usan los toggles) tanto por swipe como por click, y queda
              visible SIEMPRE (no solo durante el gesto de swipe), en
              mobile y en PC. Sin mostrar el nombre de quién lo hizo, solo
              el estado -- eso se mantiene chico a propósito. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}>
            {presColName && (
              <span
                className={`status-dot ${isPresSi ? 'status-dot-presentado' : ''}`}
                title={`Presentado: ${isPresSi ? 'Sí' : 'No'}`}
              >
                <CheckCircle2 size={13} />
              </span>
            )}
            {archColName && (
              <span
                className={`status-dot ${isArchSi ? 'status-dot-archivado' : ''}`}
                title={`Archivado: ${isArchSi ? 'Sí' : 'No'}`}
              >
                <Archive size={13} />
              </span>
            )}
          </div>

          <ChevronRight size={20} className="client-card-chevron" />
        </div>

        {/* Interactive Quick Action Toggles right on card */}
        <div className="card-quick-actions" onClick={(e) => e.stopPropagation()}>
          {/* Dedicated Presentado toggle if not in statusHeaders and column exists (ONLY on PC, mobile uses Swipe) */}
          {!hasPresInStatusHeaders && !isTouchDevice && presColName && (
            <button
              type="button"
              className={`card-quick-toggle ${isPresSi ? 'is-active-si' : 'is-inactive-no'}`}
              onClick={(e) => onToggleClick(e, presColName, nextPresValue(!isPresSi))}
              title={`Alternar Presentado (${isPresSi ? 'SÍ' : 'NO'}${presUser ? ` por ${presUser}` : ''})`}
            >
              <span className="card-quick-label">Presentado</span>
              <span className="toggle-switch-track">
                <span className="toggle-switch-thumb" />
              </span>
              <span className="toggle-status-text">{isPresSi ? 'SÍ' : 'NO'}</span>
            </button>
          )}

          {/* Dedicated Archivado toggle if not in statusHeaders and column exists (ONLY on PC, mobile uses Swipe) */}
          {!hasArchInStatusHeaders && !isTouchDevice && archColName && (
            <button
              type="button"
              className={`card-quick-toggle ${isArchSi ? 'is-active-si' : 'is-inactive-no'}`}
              onClick={(e) => onToggleClick(e, archColName, nextArchValue(!isArchSi))}
              title={`Alternar Archivado (${isArchSi ? 'SÍ' : 'NO'}${archUser ? ` por ${archUser}` : ''})`}
            >
              <span className="card-quick-label">Archivado</span>
              <span className="toggle-switch-track">
                <span className="toggle-switch-thumb" />
              </span>
              <span className="toggle-status-text">{isArchSi ? 'SÍ' : 'NO'}</span>
            </button>
          )}

          {/* Other status headers */}
          {statusHeaders.map((sh) => {
            // If on touch device and sh is Presentado/Archivado, skip because mobile uses swipe
            if (isTouchDevice && (/presentad/i.test(sh) || /archiv/i.test(sh))) {
              return null;
            }

            const val = getColValue(sh);
            const isYes = val === 'SI' || val === 'SÍ';

            let cleanLabel = getDisplayHeader(sh);
            if (/presentad/i.test(sh)) cleanLabel = 'Presentado';
            else if (/archiv/i.test(sh)) cleanLabel = 'Archivado';
            else cleanLabel = cleanLabel.replace(/\s+por$/i, '');

            const shUserCol = headers.find((h) => new RegExp(`^${sh.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*por$`, 'i').test(h));
            const shUser = shUserCol ? String(row[shUserCol] || '').trim() : '';

            return (
              <button
                key={sh}
                type="button"
                className={`card-quick-toggle ${isYes ? 'is-active-si' : 'is-inactive-no'}`}
                onClick={(e) => onToggleClick(e, sh, isYes ? 'NO' : 'SI')}
                title={`Alternar ${cleanLabel} (${isYes ? 'SÍ' : 'NO'}${shUser ? ` por ${shUser}` : ''})`}
              >
                <span className="card-quick-label">{cleanLabel}</span>
                <span className="toggle-switch-track">
                  <span className="toggle-switch-thumb" />
                </span>
                <span className="toggle-status-text">{isYes ? 'SÍ' : 'NO'}</span>
              </button>
            );
          })}
        </div>
      </motion.div>
    </motion.li>
  );
}));
SwipeableClientCard.displayName = 'SwipeableClientCard';

export default function ClientList({ user, year, month, onSelect, onChangeMonth, onNewClient }) {
  const isTouchDevice = useIsTouchDevice();
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedVencimiento, setSelectedVencimiento] = useState('todos');
  // Controla el panel de filtros como bottom-sheet en mobile. En desktop
  // este estado se ignora vía CSS: los filtros quedan siempre visibles
  // como hasta ahora.
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState('todos');
  const [selectedAssignedUser, setSelectedAssignedUser] = useState('todos');
  const [sortBy, setSortBy] = useState('alpha');
  const [activeTab, setActiveTab] = useState('lista'); // 'lista' | 'resumen'
  const [showTeamModal, setShowTeamModal] = useState(false);
  const [syncingUsers, setSyncingUsers] = useState(false);

  // Team users state
  const [teamUsers, setTeamUsers] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_TEAM);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore error
    }
    return [user].filter(Boolean);
  });

  // Sync team strictly with total users fetched from Google Sheets API
  async function syncTotalUsers(force = false) {
    setSyncingUsers(true);
    try {
      const allUsers = await api.listUsers(force);
      if (Array.isArray(allUsers) && allUsers.length > 0) {
        // Strict replacement from Google Sheets so deleted users are also removed
        const updated = Array.from(new Set(user ? [user, ...allUsers] : allUsers)).filter(Boolean);
        setTeamUsers(updated);
        localStorage.setItem(STORAGE_KEY_TEAM, JSON.stringify(updated));

        if (selectedAssignedUser !== 'todos' && !updated.includes(selectedAssignedUser)) {
          setSelectedAssignedUser('todos');
        }
      }
    } catch (e) {
      console.warn('Error al sincronizar usuarios totales:', e);
    } finally {
      setSyncingUsers(false);
    }
  }

  // Keep current logged-in user inside teamUsers list
  useEffect(() => {
    if (user && !teamUsers.includes(user)) {
      const updated = [user, ...teamUsers];
      setTeamUsers(updated);
      localStorage.setItem(STORAGE_KEY_TEAM, JSON.stringify(updated));
    }
  }, [user, teamUsers]);

  function loadData(force = false) {
    setLoading(true);
    setError('');
    syncTotalUsers(force);
    api
      .readClients(year, month, force)
      .then((data) => {
        setHeaders(data.headers || []);
        setRows(data.rows || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError('');

    // Cargar usuarios totales para el equipo directamente desde Google Sheets
    api
      .listUsers()
      .then((allUsers) => {
        if (isMounted && Array.isArray(allUsers) && allUsers.length > 0) {
          const updated = Array.from(new Set(user ? [user, ...allUsers] : allUsers)).filter(Boolean);
          setTeamUsers(updated);
          localStorage.setItem(STORAGE_KEY_TEAM, JSON.stringify(updated));
        }
      })
      .catch((err) => console.warn('Error cargando usuarios totales:', err));

    api
      .readClients(year, month)
      .then((data) => {
        if (isMounted) {
          setHeaders(data.headers || []);
          setRows(data.rows || []);
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [year, month, user]);

  const nameKey = useMemo(() => (headers.length ? pickNameColumn(headers) : null), [headers]);
  const vencimientoKey = useMemo(() => findVencimientoColumn(headers), [headers]);

  // Cantidad de filtros activos (sin contar la búsqueda por texto), para
  // mostrar el badge en el botón "Filtros" del bottom-sheet mobile.
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedAssignedUser !== 'todos') count++;
    if (selectedVencimiento !== 'todos') count++;
    if (selectedStatus !== 'todos') count++;
    return count;
  }, [selectedAssignedUser, selectedVencimiento, selectedStatus]);

  // Stamp columns (Presentado por:, Archivado por:)
  const presentadoPorCol = useMemo(() => findUserStampColumn(headers, 'presentado'), [headers]);
  const archivadoPorCol = useMemo(() => findUserStampColumn(headers, 'archivado'), [headers]);

  // Apply sequential round-robin distribution based on Vencimiento group & team users
  const assignedRows = useMemo(() => {
    return assignClientsSequentially(rows, vencimientoKey, teamUsers);
  }, [rows, vencimientoKey, teamUsers]);

  // Extract unique vencimiento numbers (e.g. 7, 9, 11) from dataset
  const availableVencimientos = useMemo(() => {
    if (!vencimientoKey || !rows.length) return [];
    const set = new Set();
    rows.forEach((r) => {
      const raw = String(r[vencimientoKey] || '').trim();
      if (raw) {
        const digits = raw.match(/\d+/);
        if (digits) {
          set.add(String(parseInt(digits[0], 10)));
        } else {
          set.add(raw);
        }
      }
    });
    return Array.from(set).sort((a, b) => {
      const na = parseInt(a, 10);
      const nb = parseInt(b, 10);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [vencimientoKey, rows]);

  // Status check headers (e.g. Presentado, Papeles, Archivado, Recibido)
  const statusHeaders = useMemo(() => {
    if (!headers.length) return [];
    return headers
      .filter((h) => {
        if (h === nameKey || h === vencimientoKey || h === presentadoPorCol || h === archivadoPorCol) return false;
        const type = getFieldType(h, '');
        return type === 'pure_yesno' || type === 'hybrid';
      })
      .slice(0, 5);
  }, [headers, nameKey, vencimientoKey, presentadoPorCol, archivadoPorCol]);

  // Primary status column (usually Presentado)
  // Antes esto tomaba "la primera columna tipo SI/NO que aparezca en la
  // planilla", que no necesariamente era "Presentado" si esa columna no es
  // la primera en tu hoja. Como el swipe/toggle siempre escribe en la
  // columna "Presentado" específicamente (ver presColName más arriba), acá
  // también hay que priorizar esa columna -- si no, las estadísticas de la
  // Tabla Resumen podían estar contando una columna distinta a la que
  // realmente se actualiza, y por eso el swipe no se reflejaba ahí.
  const primaryStatusHeader =
    statusHeaders.find((h) => /presentad/i.test(h)) || statusHeaders[0] || null;

  // Filter and Sort logic
  const filteredAndSorted = useMemo(() => {
    let list = [...assignedRows];

    // 1. Text Search Filter
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((row) =>
        Object.values(row).some((v) => String(v).toLowerCase().includes(q))
      );
    }

    // 2. Vencimiento Filter
    if (vencimientoKey && selectedVencimiento !== 'todos') {
      list = list.filter((row) => {
        const raw = String(row[vencimientoKey] || '').trim();
        const digits = raw.match(/\d+/);
        const dayStr = digits ? String(parseInt(digits[0], 10)) : raw;
        return dayStr === selectedVencimiento;
      });
    }

    // 3. Status Filter (Presentado vs Pendiente)
    if (selectedStatus !== 'todos' && primaryStatusHeader) {
      list = list.filter((row) => {
        const val = String(row[primaryStatusHeader] || '').trim().toUpperCase();
        // Si la columna de estado es "solo sello" (ej. "Presentado por:"
        // sin una "Presentado" SI/NO separada), su propio valor no va a
        // ser nunca literalmente "SI" -- va a tener un nombre o estar
        // vacía. En ese caso, "tiene un nombre cargado" ES el "SÍ".
        const isYes = val === 'SI' || val === 'SÍ' || (presentadoPorCol === primaryStatusHeader && val !== '');
        if (selectedStatus === 'presentado') return isYes;
        if (selectedStatus === 'pendiente') return !isYes;
        return true;
      });
    }

    // 4. Assigned User Filter
    if (selectedAssignedUser !== 'todos') {
      if (selectedAssignedUser === 'mis') {
        list = list.filter((row) => row._assignedUser === user);
      } else {
        list = list.filter((row) => row._assignedUser === selectedAssignedUser);
      }
    }

    // 5. Sorting (Alphabetical by default or Vencimiento)
    list.sort((a, b) => {
      if (sortBy === 'vencimiento' && vencimientoKey) {
        const rawA = String(a[vencimientoKey] || '').trim();
        const rawB = String(b[vencimientoKey] || '').trim();
        const numA = parseInt((rawA.match(/\d+/) || [])[0] || '999', 10);
        const numB = parseInt((rawB.match(/\d+/) || [])[0] || '999', 10);
        if (numA !== numB) return numA - numB;
      }

      const nameA = String(a[nameKey] || '').trim();
      const nameB = String(b[nameKey] || '').trim();
      return nameA.localeCompare(nameB, 'es', { numeric: true, sensitivity: 'base' });
    });

    return list;
  }, [
    assignedRows,
    query,
    vencimientoKey,
    selectedVencimiento,
    selectedStatus,
    primaryStatusHeader,
    presentadoPorCol,
    selectedAssignedUser,
    user,
    sortBy,
    nameKey,
  ]);

  // --- Virtualización de la lista ---
  // Antes se renderizaba un <SwipeableClientCard> real por cada cliente
  // filtrado (podían ser cientos), cada uno con animaciones y gestos de
  // arrastre activos todo el tiempo aunque estuviera fuera de pantalla.
  // Con esto, sólo se montan en el DOM las tarjetas realmente visibles
  // (+ un margen de `overscan`), y el resto se representa como espacio
  // vacío calculado. La lista scrollea con la página normal (no hay un
  // contenedor con su propio scroll), por eso se usa el virtualizador de
  // "ventana" en vez del de contenedor.
  const listRef = useRef(null);
  const rowVirtualizer = useWindowVirtualizer({
    count: filteredAndSorted.length,
    estimateSize: () => 108, // alto aproximado de una tarjeta; se ajusta solo por fila via measureElement
    overscan: 6,
    gap: 10, // mismo valor que .client-list { gap: 10px } en styles.css
    scrollMargin: listRef.current?.offsetTop ?? 0,
  });

  // Compute Summary Statistics (Table Resumen)
  const summaryData = useMemo(() => {
    if (!assignedRows.length) return [];

    const groupMap = {};

    assignedRows.forEach((row) => {
      const raw = vencimientoKey ? String(row[vencimientoKey] || '').trim() : 'General';
      const digits = raw.match(/\d+/);
      const dayKey = digits ? `Día ${parseInt(digits[0], 10)}` : raw || 'General';

      if (!groupMap[dayKey]) {
        groupMap[dayKey] = {
          dayKey,
          total: 0,
          presentados: 0,
          pendientes: 0,
          userBreakdown: {}, // { "Juan": { total: 0, presentados: 0 } }
        };
      }

      const g = groupMap[dayKey];
      g.total += 1;

      const presUser =
        presentadoPorCol && row[presentadoPorCol] ? String(row[presentadoPorCol]).trim() : '';
      const isPresentado =
        (primaryStatusHeader &&
          ['SI', 'SÍ'].includes(String(row[primaryStatusHeader] || '').trim().toUpperCase())) ||
        Boolean(presUser);

      if (isPresentado) {
        g.presentados += 1;
      } else {
        g.pendientes += 1;
      }

      const assignedUser = row._assignedUser || 'Sin Asignar';
      if (!g.userBreakdown[assignedUser]) {
        g.userBreakdown[assignedUser] = { total: 0, presentados: 0 };
      }
      g.userBreakdown[assignedUser].total += 1;
      if (isPresentado) {
        g.userBreakdown[assignedUser].presentados += 1;
      }
    });

    // Sort groupKeys logically (Día 7, Día 9, etc.)
    const sortedKeys = Object.keys(groupMap).sort((a, b) => {
      const na = parseInt((a.match(/\d+/) || [])[0] || '999', 10);
      const nb = parseInt((b.match(/\d+/) || [])[0] || '999', 10);
      return na - nb;
    });

    return sortedKeys.map((k) => groupMap[k]);
  }, [assignedRows, vencimientoKey, primaryStatusHeader, presentadoPorCol]);

  // Summary Totals
  const summaryTotals = useMemo(() => {
    let total = 0;
    let presentados = 0;
    let pendientes = 0;

    summaryData.forEach((item) => {
      total += item.total;
      presentados += item.presentados;
      pendientes += item.pendientes;
    });

    return { total, presentados, pendientes };
  }, [summaryData]);

  // Quick cell update right from card without opening client detail
  const handleQuickToggle = useCallback(
    async (e, row, column, newValue) => {
      if (e && e.stopPropagation) e.stopPropagation();
      if (!column) return;

      // Resolve exact matching header from headers array
      const exactCol =
        headers.find((h) => h === column) ||
        headers.find((h) => h.trim().toLowerCase() === String(column).trim().toLowerCase());

      if (!exactCol) {
        console.warn(`Columna "${column}" no existe en la planilla actual (${month} ${year}).`);
        return;
      }

      const isPresentadoCol = /presentad/i.test(exactCol);
      const isArchivadoCol = /archiv/i.test(exactCol);

      // ¿La columna que se está tocando (exactCol) ES ELLA MISMA la
      // columna de sello (ej. "Presentado por:", "Archivado por:")? En ese
      // caso `newValue` YA es el valor final completo (el nombre de
      // usuario o '' vacío para desmarcar) -- no hay una columna SI/NO
      // separada que además haya que completar en paralelo. Si hiciéramos
      // el auto-fill de todas formas, se pisaría a sí misma (mismo key en
      // `updates`) y el marcado nunca se guardaría bien.
      const isStampColumnItself =
        exactCol === presentadoPorCol || exactCol === archivadoPorCol;

      let updates = { [exactCol]: newValue };

      if (!isStampColumnItself) {
        // Hay una columna SI/NO real (exactCol) y, aparte, una columna de
        // sello que hay que completar o vaciar en paralelo.
        const marking = newValue === 'SI' || newValue === 'SÍ';
        if (isPresentadoCol && presentadoPorCol && headers.includes(presentadoPorCol)) {
          updates[presentadoPorCol] = marking ? user : '';
        } else if (isArchivadoCol && archivadoPorCol && headers.includes(archivadoPorCol)) {
          updates[archivadoPorCol] = marking ? user : '';
        } else if (isPresentadoCol) {
          const genericStamp = headers.find((h) => /presentad.*por/i.test(h));
          if (genericStamp) updates[genericStamp] = marking ? user : '';
        } else if (isArchivadoCol) {
          const genericStamp = headers.find((h) => /archiv.*por/i.test(h));
          if (genericStamp) updates[genericStamp] = marking ? user : '';
        }
      }

      // Optimistic update locally
      setRows((prev) =>
        prev.map((r) => (r._row === row._row ? { ...r, ...updates } : r))
      );

      try {
        const savePromises = [
          api.updateCell({
            year,
            sheet: month,
            user,
            row: row._row,
            column: exactCol,
            value: newValue,
          }),
        ];

        for (const [stampCol, stampVal] of Object.entries(updates)) {
          if (stampCol !== exactCol && headers.includes(stampCol)) {
            savePromises.push(
              api.updateCell({
                year,
                sheet: month,
                user,
                row: row._row,
                column: stampCol,
                value: stampVal,
              })
            );
          }
        }

        await Promise.all(savePromises);
      } catch (err) {
        console.error('Error actualizando estado:', err);
      }
    },
    [headers, presentadoPorCol, archivadoPorCol, user, year, month]
  );

  return (
    <div className="screen wide">
      <div className="screen-header">
        <div className="screen-title-group">
          <h2 className="screen-title">Clientes</h2>
          {/* En mobile este dato ya está en la píldora de período del
              navbar, así que se oculta para no repetirlo (ver .hide-mobile) */}
          <span className="screen-subtitle hide-mobile">
            Hoja: <strong>{formatPeriodLabel(month, year)}</strong>
          </span>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <motion.button
            className="back-btn"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowTeamModal(true)}
            title="Gestionar Equipo y Asignación"
          >
            <UserCheck size={15} />
            <span>Equipo ({teamUsers.length})</span>
          </motion.button>

          <motion.button
            className="back-btn"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => loadData(true)}
            title="Recargar datos"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </motion.button>

          {/* Redundante en mobile: la píldora de período del navbar ya
              hace exactamente esto. Se oculta solo ahí (.hide-mobile). */}
          <motion.button
            className="back-btn hide-mobile"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onChangeMonth}
            title="Cambiar período"
          >
            <Calendar size={15} />
            <span>Período</span>
          </motion.button>
        </div>
      </div>

      {/* Navegación por Apartados (Tabs) dentro del Mes */}
      <div className="screen-nav-tabs">
        <button
          type="button"
          className={`screen-nav-tab ${activeTab === 'lista' ? 'active' : ''}`}
          onClick={() => setActiveTab('lista')}
        >
          <Users size={16} />
          <span>Lista de Clientes ({filteredAndSorted.length})</span>
        </button>

        <button
          type="button"
          className={`screen-nav-tab ${activeTab === 'resumen' ? 'active' : ''}`}
          onClick={() => setActiveTab('resumen')}
        >
          <BarChart3 size={16} />
          <span>Tabla Resumen por Vencimiento</span>
        </button>
      </div>

      {/* APARTADO 1: TABLA RESUMEN GENERAL DE VENCIMIENTOS */}
      {activeTab === 'resumen' && (
        <AnimatePresence mode="wait">
          {!loading && !error && summaryData.length > 0 ? (
            <motion.div
              className="summary-panel"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              style={{ marginTop: 0 }}
            >
              <div className="summary-header">
                <div className="summary-title">
                  <BarChart3 size={20} style={{ color: 'var(--primary)' }} />
                  <span>Resumen General de Vencimientos - {formatPeriodLabel(month, year)}</span>
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  Total: {summaryTotals.total} clientes
                </span>
              </div>

              {/* Tarjetas de Métricas del Resumen */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                <div style={{ padding: '12px 16px', background: 'var(--bg-card-hover)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Total Clientes</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-main)', marginTop: '2px' }}>{summaryTotals.total}</div>
                </div>

                <div style={{ padding: '12px 16px', background: 'var(--bg-card-hover)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Presentados</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--success)', marginTop: '2px' }}>{summaryTotals.presentados}</div>
                </div>

                <div style={{ padding: '12px 16px', background: 'var(--bg-card-hover)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Pendientes</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--danger)', marginTop: '2px' }}>{summaryTotals.pendientes}</div>
                </div>

                <div style={{ padding: '12px 16px', background: 'var(--bg-card-hover)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>Avance General</div>
                  <div style={{ fontSize: '22px', fontWeight: 800, color: 'var(--primary)', marginTop: '2px' }}>
                    {summaryTotals.total > 0 ? Math.round((summaryTotals.presentados / summaryTotals.total) * 100) : 0}%
                  </div>
                </div>
              </div>

              <div className="summary-table-wrapper">
                <table className="summary-table">
                  <thead>
                    <tr>
                      <th>Vencimiento</th>
                      <th>Total Clientes</th>
                      <th>Presentados</th>
                      <th>Pendientes</th>
                      <th>Progreso</th>
                      <th>Encargado por Usuario</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryData.map((row) => {
                      const pct = row.total > 0 ? Math.round((row.presentados / row.total) * 100) : 0;
                      return (
                        <tr key={row.dayKey}>
                          <td>
                            <strong>{row.dayKey}</strong>
                          </td>
                          <td>{row.total}</td>
                          <td style={{ color: 'var(--success)', fontWeight: 600 }}>
                            {row.presentados}
                          </td>
                          <td style={{ color: 'var(--danger)', fontWeight: 600 }}>
                            {row.pendientes}
                          </td>
                          <td>
                            <div className="progress-bar-bg">
                              <div className="progress-bar-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span style={{ fontSize: '11px', fontWeight: 600 }}>{pct}%</span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                              {Object.entries(row.userBreakdown).map(([usr, stats]) => (
                                <span key={usr} className="assigned-user-badge">
                                  {usr}: {stats.presentados}/{stats.total}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    <tr className="total-row">
                      <td>TOTAL GENERAL</td>
                      <td>{summaryTotals.total}</td>
                      <td style={{ color: 'var(--success)' }}>{summaryTotals.presentados}</td>
                      <td style={{ color: 'var(--danger)' }}>{summaryTotals.pendientes}</td>
                      <td>
                        {summaryTotals.total > 0 ? Math.round((summaryTotals.presentados / summaryTotals.total) * 100) : 0}%
                      </td>
                      <td>-</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </motion.div>
          ) : (
            <div className="empty-state">
              <BarChart3 className="empty-icon" />
              <h3>Cargando resumen de vencimientos...</h3>
            </div>
          )}
        </AnimatePresence>
      )}

      {/* APARTADO 2: LISTA DE CLIENTES */}
      {activeTab === 'lista' && (
        <>
          <div className="list-actions">
        <div className="search-wrapper">
          <Search size={18} className="search-icon" />
          <input
            className="search-input"
            type="text"
            placeholder="Buscar por cliente, RUC..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <motion.button
              className="clear-search-btn"
              whileHover={{ scale: 1.15 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setQuery('')}
            >
              <X size={16} />
            </motion.button>
          )}
        </div>

        <motion.button
          className="btn-primary"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          onClick={() => onNewClient(headers)}
        >
          <Plus size={18} />
          <span>Nuevo Cliente</span>
        </motion.button>

        {/* Disparador del panel de filtros: solo visible en mobile (CSS).
            En desktop los filtros ya están siempre a la vista debajo. */}
        {!loading && !error && rows.length > 0 && (
          <button
            type="button"
            className="mobile-filters-trigger"
            onClick={() => setFiltersOpen(true)}
          >
            <Filter size={16} />
            <span>Filtros</span>
            {activeFilterCount > 0 && (
              <span className="mobile-filters-badge">{activeFilterCount}</span>
            )}
          </button>
        )}
      </div>

      {/* Filter and Sorting Panel.
          En desktop: se ve tal cual, siempre visible, como antes.
          En mobile: se convierte en un bottom-sheet controlado por
          `filtersOpen`, para no ocupar toda la pantalla de entrada. */}
      {!loading && !error && rows.length > 0 && (
        <div className={`filters-panel-wrapper ${filtersOpen ? 'is-open' : ''}`}>
          <div
            className="filters-backdrop"
            onClick={() => setFiltersOpen(false)}
            aria-hidden="true"
          />
          <div className="filter-controls-card">
            <div className="filters-sheet-header">
              <span className="filters-sheet-title">
                <Filter size={15} /> Filtros
              </span>
              <button
                type="button"
                className="filters-sheet-close"
                onClick={() => setFiltersOpen(false)}
                title="Cerrar filtros"
              >
                <X size={18} />
              </button>
            </div>

            {/* Assigned User Filter Pills */}
            <div className="filter-row">
            <span className="filter-label">
              <UserCheck size={14} /> Encargado:
            </span>
            <div className="filter-pills">
              <button
                className={`filter-pill ${selectedAssignedUser === 'todos' ? 'active' : ''}`}
                onClick={() => setSelectedAssignedUser('todos')}
              >
                Todos los usuarios
              </button>

              <button
                className={`filter-pill ${selectedAssignedUser === 'mis' ? 'active' : ''}`}
                onClick={() => setSelectedAssignedUser('mis')}
              >
                <Award size={12} /> Mis Clientes ({user})
              </button>

              {teamUsers
                .filter((u) => u !== user)
                .map((usr) => (
                  <button
                    key={usr}
                    className={`filter-pill ${selectedAssignedUser === usr ? 'active' : ''}`}
                    onClick={() => setSelectedAssignedUser(usr)}
                  >
                    {usr}
                  </button>
                ))}
            </div>
          </div>

          {/* Vencimientos Filter Pills */}
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

          {/* Status Filter Pills */}
          {primaryStatusHeader && (
            <div className="filter-row">
              <span className="filter-label">
                <Filter size={14} /> Estado ({getDisplayHeader(primaryStatusHeader)}):
              </span>
              <div className="filter-pills">
                <button
                  className={`filter-pill ${selectedStatus === 'todos' ? 'active' : ''}`}
                  onClick={() => setSelectedStatus('todos')}
                >
                  Todos
                </button>
                <button
                  className={`filter-pill ${selectedStatus === 'presentado' ? 'active' : ''}`}
                  onClick={() => setSelectedStatus('presentado')}
                >
                  <CheckCircle2 size={12} /> Presentados
                </button>
                <button
                  className={`filter-pill ${selectedStatus === 'pendiente' ? 'active' : ''}`}
                  onClick={() => setSelectedStatus('pendiente')}
                >
                  <XCircle size={12} /> Pendientes
                </button>
              </div>
            </div>
          )}

          {/* Sort selector */}
          <div className="filter-row" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className="filter-label">
                <ArrowUpDown size={14} /> Ordenar por:
              </span>
              <select
                className="sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
              >
                <option value="alpha">A - Z (Alfabético)</option>
                {vencimientoKey && <option value="vencimiento">Por Vencimiento (Día 7, 9, 11...)</option>}
              </select>
            </div>

            {(selectedVencimiento !== 'todos' ||
              selectedStatus !== 'todos' ||
              selectedAssignedUser !== 'todos' ||
              query) && (
              <motion.button
                className="back-btn"
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                style={{ padding: '4px 10px', fontSize: '12px' }}
                onClick={() => {
                  setSelectedVencimiento('todos');
                  setSelectedStatus('todos');
                  setSelectedAssignedUser('todos');
                  setQuery('');
                }}
              >
                <X size={13} /> Limpiar filtros
              </motion.button>
            )}
          </div>
          </div>
        </div>
      )}

      <div className="stats-bar">
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Users size={14} />
          <span>Mostrando</span>
          <span className="count-badge">
            {filteredAndSorted.length} de {rows.length}
          </span>
        </div>
        <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
          {selectedAssignedUser !== 'todos' && (
            <span>
              Encargado: <strong>{selectedAssignedUser === 'mis' ? user : selectedAssignedUser}</strong>
            </span>
          )}
          {selectedVencimiento !== 'todos' && (
            <span>
              Vencimiento: <strong>Día {selectedVencimiento}</strong>
            </span>
          )}
        </div>
      </div>

      {loading && (
        <div className="skeleton-container" style={{ maxWidth: '100%' }}>
          <div className="skeleton-item" style={{ height: '64px' }} />
          <div className="skeleton-item" style={{ height: '64px' }} />
          <div className="skeleton-item" style={{ height: '64px' }} />
          <div className="skeleton-item" style={{ height: '64px' }} />
        </div>
      )}

      {error && !loading && (
        <motion.div
          className="error-banner"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
        >
          <AlertCircle size={20} style={{ flexShrink: 0 }} />
          <div>
            <strong>Error al cargar clientes</strong>
            <div style={{ fontSize: '13px', marginTop: '2px' }}>{error}</div>
            <motion.button
              className="btn-secondary"
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.95 }}
              style={{ marginTop: '10px', padding: '6px 12px', fontSize: '13px' }}
              onClick={loadData}
            >
              <RefreshCw size={14} /> Reintentar
            </motion.button>
          </div>
        </motion.div>
      )}

      {!loading && !error && (
        <>
          {isTouchDevice && filteredAndSorted.length > 0 && (
            <div className="swipe-hint-bar">
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                👉 Desliza a la derecha: <strong style={{ color: '#15803d' }}>Presentado</strong>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                👈 Desliza a la izquierda: <strong style={{ color: '#6b21a8' }}>Archivado</strong>
              </span>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.ul
              key={`${query}_${selectedVencimiento}_${selectedStatus}_${selectedAssignedUser}_${sortBy}`}
              ref={listRef}
              className="client-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.18 }}
              style={{ position: 'relative', height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {rowVirtualizer.getVirtualItems().map((virtualItem) => {
                const row = filteredAndSorted[virtualItem.index];
                if (!row) return null;

                // Extract Presentado por / Archivado por from row if available
                const presUser =
                  presentadoPorCol && row[presentadoPorCol] ? String(row[presentadoPorCol]) : null;
                const archUser =
                  archivadoPorCol && row[archivadoPorCol] ? String(row[archivadoPorCol]) : null;

                // Check if Presentado / Archivado primary status columns or stamps are SÍ
                const presHeader = statusHeaders.find((h) => /presentad/i.test(h));
                const archHeader = statusHeaders.find((h) => /archiv/i.test(h));

                const isPresSi = presHeader
                  ? ['SI', 'SÍ'].includes(String(row[presHeader] || '').trim().toUpperCase())
                  : Boolean(presUser);

                const isArchSi = archHeader
                  ? ['SI', 'SÍ'].includes(String(row[archHeader] || '').trim().toUpperCase())
                  : Boolean(archUser);

                return (
                  <SwipeableClientCard
                    key={row._row}
                    ref={rowVirtualizer.measureElement}
                    dataIndex={virtualItem.index}
                    virtualStyle={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      width: '100%',
                      transform: `translateY(${virtualItem.start - rowVirtualizer.options.scrollMargin}px)`,
                    }}
                    row={row}
                    nameKey={nameKey}
                    vencimientoKey={vencimientoKey}
                    presUser={presUser}
                    archUser={archUser}
                    presHeader={presHeader}
                    archHeader={archHeader}
                    presentadoPorCol={presentadoPorCol}
                    archivadoPorCol={archivadoPorCol}
                    isPresSi={isPresSi}
                    isArchSi={isArchSi}
                    statusHeaders={statusHeaders}
                    user={user}
                    onSelect={onSelect}
                    handleQuickToggle={handleQuickToggle}
                    getDisplayHeader={getDisplayHeader}
                    itemVariants={itemVariants}
                    isTouchDevice={isTouchDevice}
                    headers={headers}
                  />
                );
              })}

            {filteredAndSorted.length === 0 && (
              <motion.div
                className="empty-state"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Users className="empty-icon" />
                <h3 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-main)', marginBottom: '4px' }}>
                  No se encontraron clientes
                </h3>
                <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  {query || selectedVencimiento !== 'todos' || selectedStatus !== 'todos' || selectedAssignedUser !== 'todos'
                    ? 'Pruebe ajustar la búsqueda o los filtros de asignación, vencimiento y estado.'
                    : 'No hay clientes cargados en esta planilla.'}
                </p>
                {query || selectedVencimiento !== 'todos' || selectedStatus !== 'todos' || selectedAssignedUser !== 'todos' ? (
                  <motion.button
                    className="btn-secondary"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setQuery('');
                      setSelectedVencimiento('todos');
                      setSelectedStatus('todos');
                      setSelectedAssignedUser('todos');
                    }}
                  >
                    Limpiar todos los filtros
                  </motion.button>
                ) : (
                  <motion.button
                    className="btn-primary"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => onNewClient(headers)}
                  >
                    <Plus size={16} /> Crear primer cliente
                  </motion.button>
                )}
              </motion.div>
            )}
            </motion.ul>
          </AnimatePresence>
        </>
      )}
    </>
  )}

  {/* Team Management Modal */}
      <AnimatePresence>
        {showTeamModal && (
          <div className="team-modal-overlay" onClick={() => setShowTeamModal(false)}>
            <motion.div
              className="team-modal"
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="team-modal-header">
                <div className="team-modal-title">
                  <UserCheck size={20} style={{ color: 'var(--primary)' }} />
                  <span>Equipo ({teamUsers.length} Usuarios Sincronizados)</span>
                </div>
                <button
                  className="clear-search-btn"
                  onClick={() => setShowTeamModal(false)}
                >
                  <X size={18} />
                </button>
              </div>

              <div style={{ backgroundColor: 'var(--primary-light)', borderRadius: 'var(--radius-md)', padding: '12px', marginBottom: '16px', border: '1px solid var(--primary-border)' }}>
                <p style={{ fontSize: '13px', color: 'var(--text-main)', margin: 0, lineHeight: '1.4' }}>
                  <strong>Gestión desde Google Sheets:</strong> Para agregar o quitar usuarios del equipo, edita directamente la lista de usuarios en tu planilla de Google Sheets. Luego presiona el botón para actualizar.
                </p>
              </div>

              <div style={{ marginBottom: '16px', maxHeight: '220px', overflowY: 'auto' }}>
                {teamUsers.map((member, idx) => (
                  <div key={member} className="team-member-chip">
                    <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span
                        style={{
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          backgroundColor: 'var(--primary)',
                          color: 'white',
                          fontSize: '11px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 700,
                        }}
                      >
                        {idx + 1}
                      </span>
                      <span style={{ fontWeight: 600 }}>{member}</span>
                    </span>
                    {member === user && (
                      <span style={{ fontSize: '11px', backgroundColor: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600 }}>
                        Tú
                      </span>
                    )}
                  </div>
                ))}
              </div>

              <motion.button
                type="button"
                className="btn-primary"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => syncTotalUsers(true)}
                disabled={syncingUsers}
                style={{ width: '100%', justifyContent: 'center', padding: '10px 16px' }}
              >
                <RefreshCw size={16} className={syncingUsers ? 'spin' : ''} />
                <span>{syncingUsers ? 'Sincronizando desde Sheets...' : 'Sincronizar usuarios desde Google Sheets'}</span>
              </motion.button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
