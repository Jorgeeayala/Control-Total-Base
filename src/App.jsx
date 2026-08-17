import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import NamePicker from './screens/NamePicker';
import YearPicker from './screens/YearPicker';
import MonthPicker from './screens/MonthPicker';
import ClientList from './screens/ClientList';
import ClientDetail from './screens/ClientDetail';
import NewClient from './screens/NewClient';
import AppSplashLoader from './components/AppSplashLoader';
import { STORAGE_KEY_USER } from './config';
import { formatPeriodLabel } from './utils';
import { FileSpreadsheet, Calendar, User, Sun, Moon } from 'lucide-react';
import './styles.css';

const pageVariants = {
  initial: { opacity: 0, y: 22, scale: 0.98 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 320, damping: 28 },
  },
  exit: {
    opacity: 0,
    y: -16,
    scale: 0.97,
    transition: { duration: 0.18, ease: 'easeIn' },
  },
};

export default function App() {
  const [user, setUser] = useState(() => localStorage.getItem(STORAGE_KEY_USER));
  const [year, setYear] = useState(null);
  const [month, setMonth] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [creatingWithHeaders, setCreatingWithHeaders] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem('app-theme');
    if (saved) return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('app-theme', theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  function handlePickUser(chosenUser) {
    setUser(chosenUser);
  }

  // Navbar for authenticated screens
  const renderNavbar = () => {
    return (
      <header className="app-navbar">
        <div className="navbar-content">
          <motion.div
            className="brand-badge"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <div className="brand-icon-wrapper">
              <FileSpreadsheet size={20} />
            </div>
            <span>Control Clientes</span>
          </motion.div>

          <div className="nav-pills">
            {user && year && month && (
              <motion.button
                className="pill-btn active"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setSelectedClient(null);
                  setCreatingWithHeaders(null);
                  setMonth(null);
                }}
                title="Cambiar mes o año"
              >
                <Calendar size={14} />
                <span>{formatPeriodLabel(month, year)}</span>
              </motion.button>
            )}

            <motion.button
              className="theme-toggle-btn"
              whileHover={{ scale: 1.08, rotate: 12 }}
              whileTap={{ scale: 0.9, rotate: -20 }}
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={theme}
                  initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
                  animate={{ opacity: 1, rotate: 0, scale: 1 }}
                  exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
                  transition={{ duration: 0.2 }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
                </motion.div>
              </AnimatePresence>
            </motion.button>

            {user && (
              <motion.button
                className="pill-btn"
                title={`Usuario actual: ${user} (Haz clic para cambiar de usuario)`}
                onClick={() => {
                  setUser(null);
                  localStorage.removeItem(STORAGE_KEY_USER);
                }}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.95 }}
                style={{ cursor: 'pointer', gap: '6px' }}
              >
                <div className="avatar-badge" style={{ display: 'flex', alignItems: 'center' }}>
                  <User size={14} />
                </div>
                <span style={{ fontSize: '13px', fontWeight: 600 }}>
                  {user}
                </span>
              </motion.button>
            )}
          </div>
        </div>
      </header>
    );
  };

  const getScreenContent = () => {
    if (!user) {
      return (
        <motion.div key="name-picker" variants={pageVariants} initial="initial" animate="animate" exit="exit">
          <NamePicker onPick={handlePickUser} />
        </motion.div>
      );
    }

    if (!year) {
      return (
        <motion.div key="year-picker" variants={pageVariants} initial="initial" animate="animate" exit="exit">
          <YearPicker onPick={setYear} user={user} />
        </motion.div>
      );
    }

    if (!month) {
      return (
        <motion.div key={`month-picker-${year}`} variants={pageVariants} initial="initial" animate="animate" exit="exit">
          <MonthPicker year={year} onPick={setMonth} onChangeYear={() => setYear(null)} />
        </motion.div>
      );
    }

    if (creatingWithHeaders) {
      return (
        <motion.div key={`new-client-${year}-${month}`} variants={pageVariants} initial="initial" animate="animate" exit="exit">
          <NewClient
            user={user}
            year={year}
            month={month}
            headers={creatingWithHeaders}
            onCancel={() => setCreatingWithHeaders(null)}
            onCreated={() => {
              setCreatingWithHeaders(null);
              setRefreshKey((k) => k + 1);
            }}
          />
        </motion.div>
      );
    }

    if (selectedClient) {
      return (
        <motion.div
          key={`client-detail-${selectedClient._row}-${year}-${month}`}
          variants={pageVariants}
          initial="initial"
          animate="animate"
          exit="exit"
        >
          <ClientDetail
            user={user}
            year={year}
            month={month}
            client={selectedClient}
            onBack={() => setSelectedClient(null)}
          />
        </motion.div>
      );
    }

    return (
      <motion.div key={`client-list-${year}-${month}-${refreshKey}`} variants={pageVariants} initial="initial" animate="animate" exit="exit">
        <ClientList
          user={user}
          year={year}
          month={month}
          onSelect={setSelectedClient}
          onChangeMonth={() => setMonth(null)}
          onNewClient={setCreatingWithHeaders}
        />
      </motion.div>
    );
  };

  return (
    <div className="app-container">
      <AppSplashLoader videoSrc="/loading.mp4" minDurationMs={2200} />
      {renderNavbar()}
      <AnimatePresence mode="wait">
        {getScreenContent()}
      </AnimatePresence>
    </div>
  );
}

