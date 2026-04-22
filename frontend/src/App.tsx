import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { ProcessDetailPage } from './pages/ProcessDetailPage';

export function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-brand-800 text-white shadow">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-brand-400 grid place-items-center font-bold">D</div>
            <div>
              <div className="text-lg font-semibold leading-tight">Document Processing System</div>
              <div className="text-xs text-brand-100/80">Async batch analysis · WebSockets · Local MLP</div>
            </div>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'text-white' : 'text-brand-100/70 hover:text-white')}>
              Dashboard
            </NavLink>
            <a
              className="text-brand-100/70 hover:text-white"
              href={`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/docs`}
              target="_blank"
              rel="noreferrer"
            >
              Swagger
            </a>
          </nav>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/processes/:id" element={<ProcessDetailPage />} />
        </Routes>
      </main>

      <footer className="border-t bg-white">
        <div className="max-w-7xl mx-auto px-6 py-3 text-xs text-slate-500 flex items-center justify-between">
          <span>NestJS · Prisma · BullMQ · Socket.IO · React · Local MLP + TextRank</span>
          <span>© Document Processing System</span>
        </div>
      </footer>
    </div>
  );
}
