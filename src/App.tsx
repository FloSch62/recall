import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import HomePage from './pages/HomePage'
import DeckPage from './pages/DeckPage'
import StudyPage from './pages/StudyPage'
import PracticePage from './pages/PracticePage'
import QuestPage from './pages/QuestPage'
import QuestLessonPage from './pages/QuestLessonPage'
import QuestCheckpointPage from './pages/QuestCheckpointPage'
import BrowsePage from './pages/BrowsePage'
import ImportPage from './pages/ImportPage'
import SettingsPage from './pages/SettingsPage'
import { Loading } from './components/Feedback'

// charts are heavy and only used here — keep them out of the main bundle
const StatsPage = lazy(() => import('./pages/StatsPage'))

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<HomePage />} />
        <Route path="import" element={<ImportPage />} />
        <Route path="deck/:deckId" element={<DeckPage />} />
        <Route path="deck/:deckId/study" element={<StudyPage />} />
        <Route path="deck/:deckId/practice" element={<PracticePage />} />
        <Route path="deck/:deckId/quest" element={<QuestPage />} />
        <Route path="deck/:deckId/quest/checkpoint/:checkpointId" element={<QuestCheckpointPage />} />
        <Route path="deck/:deckId/quest/:unit/:lesson" element={<QuestLessonPage />} />
        <Route path="deck/:deckId/browse" element={<BrowsePage />} />
        <Route
          path="stats"
          element={
            <Suspense fallback={<Loading />}>
              <StatsPage />
            </Suspense>
          }
        />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
