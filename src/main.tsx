import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { Root } from './Root.tsx'
import { Changelog } from './changelog/Changelog'
import { uploadOnce } from './sync'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
    <Changelog />
  </StrictMode>,
)

void uploadOnce()
