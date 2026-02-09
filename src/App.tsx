import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "@/components/Layout";
import Dashboard from "./pages/Dashboard";
import Estoque from "./pages/Estoque";
import Clientes from "./pages/Clientes";
import Funil from "./pages/Funil";
import Orcamentos from "./pages/Orcamentos";
import Pedidos from "./pages/Pedidos";
import NotaFiscalPage from "./pages/NotaFiscal";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/estoque" element={<Estoque />} />
            <Route path="/clientes" element={<Clientes />} />
            <Route path="/funil" element={<Funil />} />
            <Route path="/orcamentos" element={<Orcamentos />} />
            <Route path="/pedidos" element={<Pedidos />} />
            <Route path="/nota-fiscal" element={<NotaFiscalPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
