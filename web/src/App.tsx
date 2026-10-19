import { NavLink, Route, Routes, useLocation } from "react-router-dom";
import type { HomeView } from "@jobhunt/core";
import { useApi } from "./api";
import { Icon, ToastProvider } from "./ui";
import { HomePage } from "./pages/Home";
import { OffersPage } from "./pages/Offers";
import { OfferDetailPage } from "./pages/OfferDetail";
import { InterviewsPage } from "./pages/Interviews";
import { NetworkPage } from "./pages/Network";
import { PersonPage } from "./pages/Person";
import { ProfilePage } from "./pages/Profile";

export function App() {
  // Nombre de nouvelles offres affiché dans la navigation, rafraîchi à chaque page.
  const { pathname } = useLocation();
  const { data: home } = useApi<HomeView>(`/home?from=${encodeURIComponent(pathname)}`);
  const toReview = home?.counts.new ?? 0;

  return (
    <ToastProvider>
      <div className="layout">
        <nav className="nav" aria-label="Navigation principale">
          <div className="brand">Recherche d'emploi</div>
          <NavLink to="/" end>
            <Icon name="home" />
            Accueil
          </NavLink>
          <NavLink to="/offres">
            <Icon name="briefcase" />
            Offres
            {toReview > 0 && <span className="badge">{toReview}</span>}
          </NavLink>
          <NavLink to="/entretiens">
            <Icon name="calendar" />
            Entretiens
          </NavLink>
          <NavLink to="/reseau">
            <Icon name="users" />
            Réseau
          </NavLink>
          <NavLink to="/profil">
            <Icon name="book" />
            Profil
          </NavLink>
        </nav>
        <main className="main">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/offres" element={<OffersPage />} />
            <Route path="/offres/:id" element={<OfferDetailPage />} />
            <Route path="/entretiens" element={<InterviewsPage />} />
            <Route path="/reseau" element={<NetworkPage />} />
            <Route path="/reseau/:id" element={<PersonPage />} />
            <Route path="/profil/*" element={<ProfilePage />} />
            <Route path="*" element={<p>Page introuvable.</p>} />
          </Routes>
        </main>
      </div>
    </ToastProvider>
  );
}
