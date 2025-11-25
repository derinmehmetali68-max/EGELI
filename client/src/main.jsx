import React from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './styles.css'
import { applyTheme, getThemePreference } from './utils/theme'
import Login from './pages/Login.jsx'
import AppLayout from './pages/AppLayout.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Statistics from './pages/Statistics.jsx'
import Books from './pages/Books.jsx'
import BookDetail from './pages/BookDetail.jsx'
import Members from './pages/Members.jsx'
import MemberDetail from './pages/MemberDetail.jsx'
import Users from './pages/Users.jsx'
import Loans from './pages/Loans.jsx'
import Reservations from './pages/Reservations.jsx'
import Reports from './pages/Reports.jsx'
import ImportExport from './pages/ImportExport.jsx'
import Settings from './pages/Settings.jsx'
import Database from './pages/Database.jsx'
import CatalogPublic from './pages/CatalogPublic.jsx'
import Scan from './pages/Scan.jsx'
import Kiosk from './pages/Kiosk.jsx'
import ShelfMap from './pages/ShelfMap.jsx'
import Ai from './pages/Ai.jsx'
import Transfers from './pages/Transfers.jsx'
import Inventory from './pages/Inventory.jsx'
const router=createBrowserRouter([
  { path:'/', element:<Login/> },
  { path:'/catalog', element:<CatalogPublic/> },
  { path:'/kiosk', element:<Kiosk/> },
  { path:'/app', element:<AppLayout/>, children:[
    { index:true, element:<Dashboard/> },
    { path:'dashboard', element:<Dashboard/> },
    { path:'statistics', element:<Statistics/> },
    { path:'books', element:<Books/> },
    { path:'shelf-map', element:<ShelfMap/> },
    { path:'members', element:<Members/> },
    { path:'members/:id', element:<MemberDetail/> },
    { path:'users', element:<Users/> },
    { path:'loans', element:<Loans/> },
    { path:'reservations', element:<Reservations/> },
    { path:'database', element:<Database/> },
    { path:'ai', element:<Ai/> },
    { path:'reports', element:<Reports/> },
    { path:'import', element:<ImportExport/> },
    { path:'settings', element:<Settings/> },
    { path:'scan', element:<Scan/> },
    { path:'books/:id', element:<BookDetail/> },
    { path:'inventory', element:<Inventory/> },
    { path:'transfers', element:<Transfers/> },
  ]}
])
// Initialize theme on app load
applyTheme(getThemePreference());

createRoot(document.getElementById('root')).render(
  <RouterProvider router={router} future={{ v7_startTransition: true }} />
)
