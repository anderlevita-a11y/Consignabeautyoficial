import React, { useState, useEffect } from 'react';
import { 
  Map, 
  Navigation, 
  MapPin, 
  ArrowUp, 
  ArrowDown, 
  Plus, 
  CheckCircle2, 
  Clock, 
  Search,
  Loader2,
  Trash2,
  Play,
  Check,
  Edit2,
  ChevronRight,
  ExternalLink,
  User,
  X,
  Share2
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Route, RouteStop, Customer, Campaign } from '../types';
import { cn, formatError } from '../lib/utils';
import { ConfirmationModal } from './ConfirmationModal';
import { useNotifications } from './NotificationCenter';

export function Routes() {
  const { addNotification } = useNotifications();
  const [routes, setRoutes] = useState<Route[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'list' | 'create' | 'view'>('list');
  const [activeRoute, setActiveRoute] = useState<Route | null>(null);
  const [currentPos, setCurrentPos] = useState<{ lat: number; lng: number } | null>(null);
  
  // Create Form State
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<string>('');
  const [selectedCustomers, setSelectedCustomers] = useState<Customer[]>([]);
  const [routeName, setRouteName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [newRouteName, setNewRouteName] = useState('');
  const [showEditConfirmModal, setShowEditConfirmModal] = useState(false);
  const [startTime, setStartTime] = useState('08:00');
  const [serviceTime, setServiceTime] = useState(25);
  const [lunchStart, setLunchStart] = useState('12:00');
  const [lunchDuration, setLunchDuration] = useState(60);
  const [showShareModal, setShowShareModal] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [routeToDelete, setRouteToDelete] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');

  useEffect(() => {
    fetchRoutes();
    fetchInitialData();
    getUserLocation();
  }, []);

  const calculateSchedule = (route: Partial<Route>, stops: any[]) => {
    const start = route.start_time || '08:00';
    const serviceMin = route.estimated_service_time || 25;
    const lunchStartStr = route.lunch_break_start_time || '12:00';
    const lunchDur = route.lunch_break_duration || 60;
    
    let currentTime = new Date(`2000-01-01T${start}:00`);
    const lunchStartTime = new Date(`2000-01-01T${lunchStartStr}:00`);
    const lunchEndTime = new Date(lunchStartTime.getTime() + lunchDur * 60000);
    
    let lunchTaken = false;

    return stops.map((stop, idx) => {
      let travelTime = 15; // Default 15 min
      
      const cust = stop.customer || stop;
      
      if (idx === 0) {
        if (currentPos && cust.latitude) {
          const dist = calculateDistance(currentPos.lat, currentPos.lng, cust.latitude, cust.longitude!);
          travelTime = Math.max(5, Math.round(dist * 2));
        }
      } else {
        const prev = stops[idx - 1];
        const prevCust = prev.customer || prev;
        if (prevCust.latitude && cust.latitude) {
          const dist = calculateDistance(prevCust.latitude, prevCust.longitude!, cust.latitude, cust.longitude!);
          travelTime = Math.max(5, Math.round(dist * 2));
        }
      }
      
      currentTime = new Date(currentTime.getTime() + travelTime * 60000);
      
      if (!lunchTaken && currentTime >= lunchStartTime) {
        currentTime = new Date(Math.max(currentTime.getTime(), lunchEndTime.getTime()));
        lunchTaken = true;
      }
      
      const arrival = new Date(currentTime);
      currentTime = new Date(currentTime.getTime() + serviceMin * 60000);
      
      return {
        ...stop,
        estimated_arrival: arrival.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
    });
  };

  const handleShareRoute = () => {
    if (!activeRoute || !activeRoute.stops) return;
    
    const scheduledStops = calculateSchedule(activeRoute, activeRoute.stops);
    
    let message = `*Agenda da Rota: ${activeRoute.name}*\n\n`;
    scheduledStops.forEach((stop, idx) => {
      message += `${idx + 1}. *${stop.estimated_arrival}* - ${stop.customer?.nome}\n`;
      message += `   📍 ${[stop.customer?.logradouro, stop.customer?.address_number, stop.customer?.bairro].filter(Boolean).join(', ')}\n\n`;
    });
    
    const encodedMessage = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encodedMessage}`, '_blank');
  };

  const handleUpdateRouteName = async () => {
    if (!activeRoute || !newRouteName.trim()) {
      setIsEditingName(false);
      setShowEditConfirmModal(false);
      return;
    }

    if (newRouteName.trim() === activeRoute.name) {
      setIsEditingName(false);
      setShowEditConfirmModal(false);
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        addNotification({
          type: 'error',
          title: 'Não autenticado',
          message: 'Você precisa estar logado para atualizar rotas.'
        });
        return;
      }

      const { error } = await supabase
        .from('routes')
        .update({ name: newRouteName.trim() })
        .eq('id', activeRoute.id)
        .eq('user_id', session.user.id);

      if (error) throw error;

      const updatedRoute = { ...activeRoute, name: newRouteName.trim() };
      setActiveRoute(updatedRoute);
      setRoutes(prevRoutes => prevRoutes.map(r => r.id === activeRoute.id ? updatedRoute : r));
      
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Nome da rota atualizado com sucesso!'
      });
    } catch (err: any) {
      console.error('Error updating route name:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao atualizar',
        message: formatError(err)
      });
    } finally {
      setLoading(false);
      setIsEditingName(false);
      setShowEditConfirmModal(false);
    }
  };

  const handleNextStop = async () => {
    if (!activeRoute || !activeRoute.stops) return;
    
    const nextStop = activeRoute.stops
      .filter(s => s.status === 'pending')
      .sort((a, b) => a.order_index - b.order_index)[0];
      
    if (!nextStop) {
      addNotification({
        type: 'success',
        title: 'Rota concluída',
        message: 'Todas as paradas foram concluídas!'
      });
      return;
    }

    // Mark current as visited if there was one
    // Actually, the user said "clicando novamente abrirá a proxima rota da sequencia dando checkout no atendimento da cliente"
    // This implies we checkout the *current* and open the *next*.
    
    await handleMarkVisited(nextStop.id, 'pending');
    
    // Find the NEW next stop after marking the previous one as visited
    const newNextStop = activeRoute.stops
      .filter(s => s.status === 'pending' && s.id !== nextStop.id)
      .sort((a, b) => a.order_index - b.order_index)[0];

    if (newNextStop) {
      const url = getNavigateToStopUrl(newNextStop, 'maps');
      if (url) window.open(url, '_blank');
    } else {
      addNotification({
        type: 'success',
        title: 'Rota finalizada',
        message: 'Última parada concluída! Finalizando rota...'
      });
      handleFinishRoute(activeRoute.id);
    }
  };

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setCurrentPos({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
        },
        (error) => console.error('Error getting location:', error)
      );
    }
  };

  async function fetchRoutes() {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      const { data, error } = await supabase
        .from('routes')
        .select('*, stops:route_stops(*, customer:customers(*))')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setRoutes(data || []);
    } catch (err) {
      console.error('Error fetching routes:', err);
    } finally {
      setLoading(false);
    }
  }

  async function fetchInitialData() {
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) return;

    const [campRes, custRes] = await Promise.all([
      supabase.from('campaigns').select('*').eq('user_id', user.id).eq('status', 'active'),
      supabase.from('customers').select('*').eq('user_id', user.id)
    ]);
    if (campRes.data) setCampaigns(campRes.data);
    if (custRes.data) setCustomers(custRes.data);
  }

  const handleCampaignSelect = async (campaignId: string) => {
    setSelectedCampaign(campaignId);
    // Fetch customers with bags in this campaign
    const { data: bags } = await supabase
      .from('bags')
      .select('customer_id')
      .eq('campaign_id', campaignId);
    
    if (bags) {
      const customerIds = Array.from(new Set(bags.map(b => b.customer_id).filter(Boolean)));
      const campaignCustomers = customers.filter(c => customerIds.includes(c.id));
      setSelectedCustomers(campaignCustomers);
    }
  };

  const toggleCustomer = (customer: Customer) => {
    if (selectedCustomers.find(c => c.id === customer.id)) {
      setSelectedCustomers(selectedCustomers.filter(c => c.id !== customer.id));
    } else {
      setSelectedCustomers([...selectedCustomers, customer]);
    }
  };

  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const optimizeRoute = () => {
    if (!currentPos) {
      addNotification({ type: 'error', title: 'GPS', message: 'Localização GPS não disponível. Verifique as permissões do navegador.' });
      getUserLocation();
      return;
    }
    if (selectedCustomers.length === 0) return;

    let unvisited = [...selectedCustomers];
    let optimized: Customer[] = [];
    let currentLat = currentPos.lat;
    let currentLng = currentPos.lng;

    // Separate customers with and without GPS coordinates
    let withGps = unvisited.filter(c => c.latitude && c.longitude);
    let withoutGps = unvisited.filter(c => !c.latitude || !c.longitude);

    // Nearest Neighbor Algorithm
    while (withGps.length > 0) {
      let nearestIdx = 0;
      let minDist = Infinity;

      withGps.forEach((cust, idx) => {
        const dist = calculateDistance(currentLat, currentLng, cust.latitude!, cust.longitude!);
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = idx;
        }
      });

      const nextCust = withGps.splice(nearestIdx, 1)[0];
      optimized.push(nextCust);
      currentLat = nextCust.latitude!;
      currentLng = nextCust.longitude!;
    }

    setSelectedCustomers([...optimized, ...withoutGps]);
    addNotification({ type: 'success', title: 'Sucesso', message: 'Rota otimizada com a melhor sequência de atendimento!' });
  };

  const optimizeActiveRoute = async () => {
    if (!currentPos) {
      addNotification({ type: 'error', title: 'GPS', message: 'Localização GPS não disponível.' });
      getUserLocation();
      return;
    }
    if (!activeRoute || !activeRoute.stops) return;
    
    setLoading(true);
    try {
      let unvisited = [...activeRoute.stops];
      let optimizedStops: RouteStop[] = [];
      let currentLat = currentPos.lat;
      let currentLng = currentPos.lng;

      // Separate stops with and without GPS coordinates
      let withGps = unvisited.filter(s => s.customer?.latitude && s.customer?.longitude);
      let withoutGps = unvisited.filter(s => !s.customer?.latitude || !s.customer?.longitude);

      // Nearest Neighbor Algorithm
      while (withGps.length > 0) {
        let nearestIdx = 0;
        let minDist = Infinity;

        withGps.forEach((stop, idx) => {
          const dist = calculateDistance(currentLat, currentLng, stop.customer!.latitude!, stop.customer!.longitude!);
          if (dist < minDist) {
            minDist = dist;
            nearestIdx = idx;
          }
        });

        const nextStop = withGps.splice(nearestIdx, 1)[0];
        optimizedStops.push(nextStop);
        currentLat = nextStop.customer!.latitude!;
        currentLng = nextStop.customer!.longitude!;
      }

      const finalStops = [...optimizedStops, ...withoutGps];

      // Update order_index in database
      await Promise.all(finalStops.map((stop, i) => 
        supabase
          .from('route_stops')
          .update({ order_index: i })
          .eq('id', stop.id)
      ));

      // Update local state
      const updatedStops = finalStops.map((s, idx) => ({ ...s, order_index: idx }));
      setActiveRoute({ ...activeRoute, stops: updatedStops });
      
      // Update routes list
      setRoutes(routes.map(r => r.id === activeRoute.id ? { ...r, stops: updatedStops } : r));
      
      addNotification({ type: 'success', title: 'Sucesso', message: 'Rota otimizada com a melhor sequência de atendimento!' });
    } catch (err: any) {
      console.error('Error optimizing active route:', err);
      addNotification({ type: 'error', title: 'Erro', message: 'Erro ao otimizar rota: ' + (err.message || JSON.stringify(err)) });
    } finally {
      setLoading(false);
    }
  };

  const moveItem = (index: number, direction: 'up' | 'down') => {
    const newItems = [...selectedCustomers];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newItems.length) return;
    
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;
    setSelectedCustomers(newItems);
  };

  const moveActiveRouteItem = async (index: number, direction: 'up' | 'down') => {
    if (!activeRoute || !activeRoute.stops) return;
    
    const newStops = [...activeRoute.stops].sort((a, b) => a.order_index - b.order_index);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newStops.length) return;
    
    // Swap order_index
    const tempOrder = newStops[index].order_index;
    newStops[index].order_index = newStops[targetIndex].order_index;
    newStops[targetIndex].order_index = tempOrder;
    
    // Re-sort array
    newStops.sort((a, b) => a.order_index - b.order_index);
    
    setActiveRoute({ ...activeRoute, stops: newStops });
    
    try {
      // Update in database
      await Promise.all([
        supabase.from('route_stops').update({ order_index: newStops[index].order_index }).eq('id', newStops[index].id),
        supabase.from('route_stops').update({ order_index: newStops[targetIndex].order_index }).eq('id', newStops[targetIndex].id)
      ]);
      
      // Update routes list
      setRoutes(routes.map(r => r.id === activeRoute.id ? { ...r, stops: newStops } : r));
    } catch (err: any) {
      console.error('Error updating order:', err);
      addNotification({ type: 'error', title: 'Erro', message: 'Erro ao atualizar ordem: ' + (err.message || JSON.stringify(err)) });
    }
  };

  const getNavigateToStopUrl = (stop: RouteStop, app: 'maps' | 'waze') => {
    const cust = stop.customer;
    if (!cust) return null;

    if (cust.latitude && cust.longitude) {
      const lat = cust.latitude;
      const lng = cust.longitude;
      if (app === 'maps') {
        return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
      } else {
        return `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
      }
    }

    // Fallback to address
    const addressParts = [
      cust.logradouro,
      cust.address_number,
      cust.bairro,
      cust.cidade,
      cust.estado,
      'Brasil'
    ].filter(Boolean);

    if (addressParts.length === 0) return null;

    const address = encodeURIComponent(addressParts.join(', '));
    if (app === 'maps') {
      return `https://www.google.com/maps/dir/?api=1&destination=${address}`;
    } else {
      return `https://waze.com/ul?q=${address}&navigate=yes`;
    }
  };

  const getNavigateFullRouteUrl = () => {
    if (!activeRoute || !activeRoute.stops) return null;
    
    const pendingStops = activeRoute.stops
      .filter(s => {
        if (s.status !== 'pending') return false;
        const cust = s.customer;
        if (!cust) return false;
        return (cust.latitude && cust.longitude) || (cust.logradouro && cust.cidade);
      })
      .sort((a, b) => a.order_index - b.order_index);
      
    if (pendingStops.length === 0) return null;
    
    if (pendingStops.length === 1) {
      return getNavigateToStopUrl(pendingStops[0], 'maps');
    }
    
    const stopsToNavigate = pendingStops.slice(0, 10);
    const destination = stopsToNavigate[stopsToNavigate.length - 1];
    const waypoints = stopsToNavigate.slice(0, -1);
    
    const getStopLoc = (s: RouteStop) => {
      if (s.customer?.latitude && s.customer?.longitude) {
        return `${s.customer.latitude},${s.customer.longitude}`;
      }
      return [s.customer?.logradouro, s.customer?.address_number, s.customer?.bairro, s.customer?.cidade].filter(Boolean).join(', ');
    };

    const waypointsStr = waypoints.map(s => encodeURIComponent(getStopLoc(s))).join('|');
    const destStr = encodeURIComponent(getStopLoc(destination));
    
    let url = `https://www.google.com/maps/dir/?api=1&destination=${destStr}`;
    if (waypoints.length > 0) {
      url += `&waypoints=${waypointsStr}`;
    }
    
    return url;
  };

  const handleSaveRoute = async () => {
    if (!routeName) {
      addNotification({
        type: 'warning',
        title: 'Campo obrigatório',
        message: 'Dê um nome para a rota'
      });
      return;
    }
    if (selectedCustomers.length === 0) {
      addNotification({
        type: 'warning',
        title: 'Seleção necessária',
        message: 'Selecione pelo menos um cliente'
      });
      return;
    }

    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
      if (!user) return;

      const { data: route, error: routeError } = await supabase
        .from('routes')
        .insert([{
          name: routeName,
          user_id: user.id,
          status: 'pending',
          start_time: startTime,
          estimated_service_time: serviceTime,
          lunch_break_start_time: lunchStart,
          lunch_break_duration: lunchDuration
        }])
        .select()
        .single();

      if (routeError) throw routeError;

      const stops = selectedCustomers.map((cust, idx) => ({
        route_id: route.id,
        customer_id: cust.id,
        order_index: idx,
        status: 'pending',
        user_id: user.id
      }));

      const { error: stopsError } = await supabase
        .from('route_stops')
        .insert(stops);

      if (stopsError) {
        await supabase.from('routes').delete().eq('id', route.id);
        throw stopsError;
      }

      // Prepare active route with stops and customer data
      const routeWithStops = {
        ...route,
        stops: stops.map((s, i) => ({
          ...s,
          customer: selectedCustomers[i]
        }))
      };

      setView('list');
      setRouteName('');
      setSelectedCustomers([]);
      fetchRoutes();
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Rota salva com sucesso!'
      });
    } catch (err: any) {
      console.error('Error saving route:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao salvar',
        message: formatError(err)
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomerToRoute = async (customer: Customer) => {
    if (!activeRoute) return;
    
    // Check if customer is already in the route
    if (activeRoute.stops?.some(s => s.customer_id === customer.id)) {
      addNotification({
        type: 'warning',
        title: 'Aviso',
        message: 'Este cliente já está na rota.'
      });
      return;
    }
    
    try {
      setLoading(true);
      const newOrderIndex = activeRoute.stops ? activeRoute.stops.length : 0;
      
      const { data: newStop, error } = await supabase
        .from('route_stops')
        .insert([{
          route_id: activeRoute.id,
          customer_id: customer.id,
          order_index: newOrderIndex,
          status: 'pending',
          user_id: activeRoute.user_id
        }])
        .select()
        .single();

      if (error) throw error;

      const stopWithCustomer = { ...newStop, customer };
      
      const updatedStops = [...(activeRoute.stops || []), stopWithCustomer];
      const updatedRoute = { ...activeRoute, stops: updatedStops };
      
      setActiveRoute(updatedRoute);
      setRoutes(routes.map(r => r.id === activeRoute.id ? updatedRoute : r));
      
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Cliente adicionado à rota com sucesso!'
      });
      setCustomerSearch('');
    } catch (err: any) {
      console.error('Error adding customer to route:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao adicionar',
        message: formatError(err)
      });
    } finally {
      setLoading(false);
    }
  };

  const handleMarkVisited = async (stopId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'visited' ? 'pending' : 'visited';
    
    try {
      const { error } = await supabase
        .from('route_stops')
        .update({ status: newStatus })
        .eq('id', stopId);

      if (error) throw error;

      // Update local state
      if (activeRoute) {
        const updatedStops = activeRoute.stops?.map(stop => 
          stop.id === stopId ? { ...stop, status: newStatus as 'visited' | 'pending' } : stop
        );
        setActiveRoute({ ...activeRoute, stops: updatedStops });
      }
      
      // Update routes list
      setRoutes(routes.map(r => {
        if (r.id === activeRoute?.id || r.id === routes.find(route => route.stops?.some(s => s.id === stopId))?.id) {
          return {
            ...r,
            stops: r.stops?.map(stop => 
              stop.id === stopId ? { ...stop, status: newStatus as 'visited' | 'pending' } : stop
            )
          };
        }
        return r;
      }));
    } catch (err: any) {
      console.error('Error updating stop status:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao atualizar',
        message: formatError(err)
      });
    }
  };

  const handleDeleteRoute = async (routeId: string) => {
    setLoading(true);
    try {
      // Delete stops first (cascade should handle it but let's be safe)
      const { error: stopsError } = await supabase
        .from('route_stops')
        .delete()
        .eq('route_id', routeId);

      if (stopsError) throw stopsError;

      const { error: routeError } = await supabase
        .from('routes')
        .delete()
        .eq('id', routeId);

      if (routeError) throw routeError;

      setRoutes(routes.filter(r => r.id !== routeId));
      if (activeRoute?.id === routeId) {
        setActiveRoute(null);
        setView('list');
      }
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Rota excluída com sucesso!'
      });
    } catch (err: any) {
      console.error('Error deleting route:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao excluir',
        message: formatError(err)
      });
    } finally {
      setLoading(false);
      setDeleteModalOpen(false);
      setRouteToDelete(null);
    }
  };

  const handleFinishRoute = async (routeId: string) => {
    try {
      const { error } = await supabase
        .from('routes')
        .update({ status: 'completed' })
        .eq('id', routeId);

      if (error) throw error;

      setRoutes(routes.map(r => r.id === routeId ? { ...r, status: 'completed' } : r));
      if (activeRoute?.id === routeId) {
        setActiveRoute({ ...activeRoute, status: 'completed' });
      }
      
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Rota finalizada com sucesso!'
      });
    } catch (err) {
      console.error('Error finishing route:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao finalizar',
        message: 'Erro ao finalizar rota'
      });
    }
  };

  const handleReopenRoute = async (routeId: string) => {
    try {
      const { error } = await supabase
        .from('routes')
        .update({ status: 'pending' })
        .eq('id', routeId);

      if (error) throw error;

      setRoutes(routes.map(r => r.id === routeId ? { ...r, status: 'pending' } : r));
      if (activeRoute?.id === routeId) {
        setActiveRoute({ ...activeRoute, status: 'pending' });
      }
      
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Rota reaberta com sucesso!'
      });
    } catch (err) {
      console.error('Error reopening route:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao reabrir',
        message: 'Erro ao reabrir rota'
      });
    }
  };

  const handleDeleteStop = async (stopId: string) => {
    if (!activeRoute) return;
    
    try {
      setLoading(true);
      const { error } = await supabase
        .from('route_stops')
        .delete()
        .eq('id', stopId);

      if (error) throw error;

      const updatedStops = activeRoute.stops?.filter(s => s.id !== stopId) || [];
      const updatedRoute = { ...activeRoute, stops: updatedStops };
      
      setActiveRoute(updatedRoute);
      setRoutes(routes.map(r => r.id === activeRoute.id ? updatedRoute : r));
      
      addNotification({
        type: 'success',
        title: 'Sucesso',
        message: 'Cliente removido da rota!'
      });
    } catch (err: any) {
      console.error('Error deleting stop:', err);
      addNotification({
        type: 'error',
        title: 'Erro ao remover',
        message: formatError(err)
      });
    } finally {
      setLoading(false);
    }
  };

  const renderContent = () => {
    if (view === 'create') {
      return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <h2 className="text-2xl font-bold text-zinc-800 tracking-tight text-center sm:text-left">Nova Rota de Atendimento</h2>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              <button 
                onClick={() => setView('list')}
                className="px-4 py-3 sm:py-2 text-sm font-bold text-zinc-500 hover:text-zinc-800 transition-colors bg-zinc-100 hover:bg-zinc-200 rounded-xl w-full sm:w-auto text-center"
              >
                Cancelar
              </button>
              <button 
                id="create-route-save-button"
                onClick={handleSaveRoute}
                disabled={loading}
                className="flex items-center justify-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-3 sm:py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 w-full sm:w-auto active:scale-95 disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Salvar Rota
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white border border-zinc-200 rounded-[24px] sm:rounded-[32px] p-4 sm:p-6 shadow-sm space-y-6">
              <h3 className="font-bold text-zinc-800 uppercase text-xs tracking-widest px-2">Configuração</h3>
              
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-2">Nome da Rota</label>
                <input 
                  type="text" 
                  placeholder="Ex: Rota Centro - Terça"
                  value={routeName}
                  onChange={(e) => setRouteName(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl sm:rounded-2xl px-4 py-3 sm:py-3.5 text-sm text-zinc-800 focus:border-emerald-500 focus:bg-white outline-none transition-all shadow-sm"
                  autoComplete="off"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-2">Início</label>
                  <input 
                    type="time" 
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl sm:rounded-2xl px-4 py-3 sm:py-3.5 text-sm text-zinc-800 focus:border-emerald-500 focus:bg-white outline-none transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-2">Atendimento (min)</label>
                  <input 
                    type="number" 
                    value={serviceTime}
                    onChange={(e) => setServiceTime(parseInt(e.target.value) || 0)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl sm:rounded-2xl px-4 py-3 sm:py-3.5 text-sm text-zinc-800 focus:border-emerald-500 focus:bg-white outline-none transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-2">Início Almoço</label>
                  <input 
                    type="time" 
                    value={lunchStart}
                    onChange={(e) => setLunchStart(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl sm:rounded-2xl px-4 py-3 sm:py-3.5 text-sm text-zinc-800 focus:border-emerald-500 focus:bg-white outline-none transition-all shadow-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-2">Almoço (min)</label>
                  <input 
                    type="number" 
                    value={lunchDuration}
                    onChange={(e) => setLunchDuration(parseInt(e.target.value) || 0)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl sm:rounded-2xl px-4 py-3 sm:py-3.5 text-sm text-zinc-800 focus:border-emerald-500 focus:bg-white outline-none transition-all shadow-sm"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-2">Basear em Campanha</label>
                <select 
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl sm:rounded-2xl px-4 py-3 sm:py-3.5 text-sm text-zinc-800 focus:border-emerald-500 focus:bg-white outline-none transition-all shadow-sm"
                  value={selectedCampaign}
                  onChange={(e) => handleCampaignSelect(e.target.value)}
                >
                  <option value="">Nenhuma campanha</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div className="pt-4 sm:pt-6 border-t border-zinc-100">
                <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4 pl-2">Adicionar Clientes</h4>
                
                <div className="relative mb-4">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl sm:rounded-2xl pl-11 pr-4 py-3 sm:py-3.5 text-sm text-zinc-800 focus:border-emerald-500 focus:bg-white outline-none transition-all shadow-sm"
                  />
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                  {customers
                    .filter(cust => cust.nome.toLowerCase().includes(customerSearch.toLowerCase()))
                    .map(cust => (
                    <button 
                      key={cust.id}
                      onClick={() => toggleCustomer(cust)}
                      className={cn(
                        "w-full flex items-center justify-between p-3 sm:p-4 rounded-xl sm:rounded-[20px] border transition-all text-left",
                        selectedCustomers.find(c => c.id === cust.id)
                          ? "bg-emerald-50 border-emerald-200 text-emerald-700 font-bold"
                          : "bg-white border-zinc-100 text-zinc-600 hover:border-zinc-200 font-medium"
                      )}
                    >
                      <span className="text-xs truncate mr-2">{cust.nome}</span>
                      {selectedCustomers.find(c => c.id === cust.id) ? (
                        <div className="p-1 bg-emerald-500 text-white rounded-full flex-shrink-0"><Check className="w-3 h-3" /></div>
                      ) : (
                        <Plus className="w-3.5 h-3.5 text-zinc-300 flex-shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-zinc-200 rounded-[24px] sm:rounded-[32px] shadow-sm overflow-hidden min-h-[400px] sm:min-h-[500px]">
              <div className="p-4 sm:p-8 border-b border-zinc-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-50/50">
                <div className="flex items-center gap-3 sm:gap-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-[16px] sm:rounded-[20px] bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                    <Navigation className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-zinc-800 text-base sm:text-lg">Sequência da Rota</h3>
                    <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold italic hidden sm:block">Organize ou use a otimização inteligente</p>
                    <p className="text-[10px] text-zinc-400 uppercase tracking-widest font-bold italic sm:hidden">Toque para organizar</p>
                  </div>
                </div>
                <button 
                  onClick={optimizeRoute}
                  className="flex items-center justify-center gap-2 bg-zinc-900 hover:bg-black text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl text-[10px] uppercase font-black tracking-widest transition-all shadow-md active:scale-95 w-full sm:w-auto"
                >
                  <Map className="w-4 h-4" />
                  Otimizar Rota
                </button>
              </div>

              <div className="p-4 sm:p-8">
                {selectedCustomers.length === 0 ? (
                  <div className="py-16 sm:py-24 text-center space-y-4">
                    <div className="w-16 h-16 sm:w-24 sm:h-24 bg-zinc-50 rounded-full flex items-center justify-center mx-auto border border-zinc-100 border-dashed">
                      <MapPin className="w-8 h-8 sm:w-10 sm:h-10 text-zinc-200" />
                    </div>
                    <p className="text-zinc-400 text-sm font-medium italic">Selecione clientes para calcular o trajeto.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {selectedCustomers.map((cust, idx) => (
                      <div key={cust.id} className="flex items-center gap-3 sm:gap-4 group">
                        <div className="flex flex-col items-center gap-2">
                          <div className={cn(
                            "w-8 h-8 sm:w-10 sm:h-10 rounded-full border-2 flex items-center justify-center text-[10px] sm:text-xs font-black transition-all",
                            idx === 0 ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-500/20" : "bg-white border-zinc-200 text-zinc-400"
                          )}>
                            {idx + 1}
                          </div>
                          {idx < selectedCustomers.length - 1 && <div className="w-[1px] h-8 sm:h-10 bg-zinc-100 border-l border-dashed border-zinc-200" />}
                        </div>
                        
                        <div className="flex-1 bg-white border border-zinc-100 rounded-[20px] sm:rounded-[24px] p-3 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-emerald-200 transition-all shadow-sm group-hover:shadow-md">
                          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-zinc-50 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-50 transition-colors">
                              <User className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-300 group-hover:text-emerald-500" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-zinc-800 leading-tight mb-0.5">{cust.nome}</p>
                              <p className="text-[10px] text-zinc-400 font-medium truncate italic max-w-full">
                                {[cust.logradouro, cust.address_number, cust.bairro, cust.cidade].filter(Boolean).join(', ') || 'Sem endereço detalhado'}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-1 bg-zinc-50 p-1 rounded-xl border border-zinc-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity justify-end">
                            <button onClick={() => moveItem(idx, 'up')} disabled={idx === 0} className="p-2 hover:bg-white hover:text-emerald-500 text-zinc-400 rounded-lg disabled:opacity-0 transition-all font-bold"><ArrowUp className="w-4 h-4" /></button>
                            <button onClick={() => moveItem(idx, 'down')} disabled={idx === selectedCustomers.length - 1} className="p-2 hover:bg-white hover:text-emerald-500 text-zinc-400 rounded-lg disabled:opacity-0 transition-all font-bold"><ArrowDown className="w-4 h-4" /></button>
                            <div className="w-px h-6 bg-zinc-200 mx-1" />
                            <button onClick={() => toggleCustomer(cust)} className="p-2 hover:bg-white hover:text-red-500 text-zinc-400 rounded-lg transition-all"><Trash2 className="w-4 h-4" /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </div>
      );
    }

    if (view === 'view' && activeRoute) {
      return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-6">
            <div className="flex items-center gap-3 sm:gap-6 min-w-0">
              <button 
                onClick={() => {
                  setView('list');
                  setActiveRoute(null);
                }}
                className="p-2.5 sm:p-3 bg-zinc-100 hover:bg-zinc-200 rounded-xl sm:rounded-2xl transition-all active:scale-90"
              >
                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6 text-zinc-500 rotate-180" />
              </button>
              <div id="route-header-info" className="flex-1 min-w-0">
                {isEditingName ? (
                  <div id="route-name-edit-container" className="flex flex-col sm:flex-row sm:items-center gap-3 animate-in fade-in slide-in-from-left-2 w-full">
                    <input
                      id="route-name-edit-input"
                      type="text"
                      value={newRouteName}
                      onChange={(e) => setNewRouteName(e.target.value)}
                      className="text-lg sm:text-2xl lg:text-3xl font-bold text-zinc-800 tracking-tight bg-white border-2 border-emerald-500 rounded-xl sm:rounded-2xl px-4 py-2 sm:py-2.5 outline-none w-full sm:max-w-md shadow-lg shadow-emerald-500/10"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') setShowEditConfirmModal(true);
                        if (e.key === 'Escape') setIsEditingName(false);
                      }}
                    />
                    <div className="flex items-center gap-2 justify-end sm:justify-start">
                      <button
                        id="save-route-name-button"
                        onClick={() => setShowEditConfirmModal(true)}
                        disabled={loading || !newRouteName.trim()}
                        className="p-2.5 sm:p-3 bg-emerald-500 text-white rounded-xl sm:rounded-2xl hover:bg-emerald-600 transition-all shadow-lg shadow-emerald-500/20 active:scale-90 disabled:opacity-50"
                        title="Salvar Alteração"
                      >
                        {loading ? <Loader2 className="w-5 h-5 sm:w-6 sm:h-6 animate-spin" /> : <Check className="w-5 h-5 sm:w-6 sm:h-6 transition-transform hover:scale-110" id="save-route-check-icon" />}
                      </button>
                      <button
                        id="cancel-route-name-button"
                        onClick={() => setIsEditingName(false)}
                        disabled={loading}
                        className="p-2.5 sm:p-3 bg-zinc-100 text-zinc-500 rounded-xl sm:rounded-2xl hover:bg-zinc-200 transition-all active:scale-90"
                        title="Cancelar"
                      >
                        <X className="w-5 h-5 sm:w-6 sm:h-6" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div id="route-name-display-container" className="flex items-center gap-3 sm:gap-4">
                    <h2 id="route-name-title" className="text-xl sm:text-2xl lg:text-3xl font-black text-zinc-800 tracking-tight truncate max-w-[180px] sm:max-w-none">{activeRoute.name}</h2>
                    <button
                      id="edit-route-name-button"
                      onClick={() => {
                        setNewRouteName(activeRoute.name);
                        setIsEditingName(true);
                      }}
                      className="p-2 sm:p-2.5 text-zinc-300 hover:text-emerald-500 hover:bg-emerald-50 rounded-xl sm:rounded-2xl transition-all border border-transparent hover:border-emerald-100"
                      title="Editar Nome da Rota"
                    >
                      <Edit2 className="w-4 h-4 sm:w-5 sm:h-5" />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-3 sm:gap-4 mt-2">
                  <div className="flex-1 max-w-[100px] sm:max-w-[150px] bg-zinc-100 h-1 sm:h-1.5 rounded-full overflow-hidden">
                    <div 
                      className="bg-emerald-500 h-full transition-all duration-700 ease-out" 
                      style={{ width: `${(activeRoute.stops?.filter(s => s.status === 'visited').length || 0) / (activeRoute.stops?.length || 1) * 100}%` }} 
                    />
                  </div>
                  <p className="text-[10px] sm:text-xs font-bold text-zinc-400 uppercase tracking-widest whitespace-nowrap">
                    {(activeRoute.stops?.filter(s => s.status === 'visited').length || 0)}/{(activeRoute.stops?.length || 0)} concluídas
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <button
                onClick={handleShareRoute}
                className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl border border-zinc-200 text-zinc-600 font-bold text-[10px] sm:text-xs hover:bg-zinc-50 transition-all active:scale-95 shadow-sm"
              >
                <Share2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Compartilhar Agenda
              </button>
              <button
                onClick={optimizeActiveRoute}
                className="flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-zinc-900 text-white font-bold text-[10px] sm:text-xs hover:bg-black transition-all shadow-lg active:scale-95"
              >
                <Map className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                Otimizar Rota
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-12">
            <div className="space-y-6">
              <div className="bg-white border border-zinc-200 rounded-[24px] sm:rounded-[40px] overflow-hidden shadow-sm">
                <div className="p-4 sm:p-8 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/30">
                  <h3 className="font-bold text-zinc-800 text-base sm:text-lg">Paradas Planejadas</h3>
                  <div className="flex items-center gap-3 sm:gap-5 text-[9px] sm:text-[10px] font-black uppercase tracking-tighter text-zinc-400">
                    <span className="flex items-center gap-1 sm:gap-2"><div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-emerald-500 shadow-sm" /> Feito</span>
                    <span className="flex items-center gap-1 sm:gap-2"><div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-zinc-200" /> Pendente</span>
                  </div>
                </div>

                <div className="p-4 sm:p-8 space-y-4 sm:space-y-6">
                  {(activeRoute.stops || []).sort((a,b) => a.order_index - b.order_index).map((stop, idx) => (
                    <div key={stop.id} className="group relative">
                      <div className="flex items-start gap-3 sm:gap-6">
                        <div className="flex flex-col items-center gap-2 sm:gap-3 mt-4">
                          <button
                            onClick={() => handleMarkVisited(stop.id, stop.status)}
                            className={cn(
                              "w-8 h-8 sm:w-11 sm:h-11 rounded-full border-2 flex items-center justify-center transition-all z-10",
                              stop.status === 'visited'
                                ? "bg-emerald-500 border-emerald-500 text-white shadow-xl shadow-emerald-500/20"
                                : "bg-white border-zinc-200 text-zinc-100 hover:border-emerald-300 hover:text-emerald-500"
                            )}
                          >
                            <Check className="w-4 h-4 sm:w-6 sm:h-6 font-black" />
                          </button>
                          {idx < (activeRoute.stops?.length || 0) - 1 && (
                            <div className={cn(
                              "w-[1px] h-16 sm:h-20 transition-colors",
                              stop.status === 'visited' ? "bg-emerald-500/20" : "bg-zinc-100"
                            )} />
                          )}
                        </div>

                        <div className={cn(
                          "flex-1 p-4 sm:p-6 rounded-[24px] sm:rounded-[32px] border transition-all duration-500 shadow-sm",
                          stop.status === 'visited' ? "bg-zinc-50 border-zinc-100 opacity-60" : "bg-white border-zinc-200 group-hover:shadow-xl group-hover:border-emerald-100 lg:group-hover:-translate-y-1"
                        )}>
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 sm:gap-6">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1.5 sm:mb-2">
                                <h4 className="font-bold text-zinc-800 text-base sm:text-lg tracking-tight truncate">{stop.customer?.nome}</h4>
                                <span className={cn(
                                  "text-[8px] sm:text-[10px] font-black px-2 py-0.5 sm:py-1 rounded-full uppercase tracking-widest flex-shrink-0",
                                  stop.status === 'visited' ? "bg-emerald-100 text-emerald-700" : "bg-zinc-100 text-zinc-500 border border-zinc-200"
                                )}>
                                  # {idx + 1}
                                </span>
                              </div>
                              <p className="text-[10px] sm:text-xs text-zinc-400 font-medium mb-4 sm:mb-6 truncate italic">
                                {[stop.customer?.logradouro, stop.customer?.address_number, stop.customer?.bairro].filter(Boolean).join(', ') || 'Endereço não disponível'}
                              </p>
                              
                              <div className="flex items-center gap-2 sm:gap-3">
                                <button
                                  onClick={() => {
                                    const url = getNavigateToStopUrl(stop, 'maps');
                                    if (url) window.open(url, '_blank');
                                  }}
                                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-emerald-500 text-white font-bold text-[9px] sm:text-[10px] uppercase tracking-widest hover:bg-emerald-600 transition-all shadow-lg active:scale-95"
                                >
                                  <Navigation className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  G-Maps
                                </button>
                                <button
                                  onClick={() => {
                                    const url = getNavigateToStopUrl(stop, 'waze');
                                    if (url) window.open(url, '_blank');
                                  }}
                                  className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-xl sm:rounded-2xl bg-[#33CCFF] text-white font-bold text-[9px] sm:text-[10px] uppercase tracking-widest hover:bg-[#2BB8E5] transition-all shadow-lg active:scale-95"
                                >
                                  <ExternalLink className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  Waze
                                </button>
                              </div>
                            </div>

                            <div className="flex flex-row sm:flex-col gap-1 sm:gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity p-1 bg-zinc-50 border border-zinc-100 rounded-xl sm:rounded-[20px] justify-end">
                              <button
                                onClick={() => moveActiveRouteItem(idx, 'up')}
                                disabled={idx === 0}
                                className="p-2 sm:p-2.5 hover:bg-white hover:text-emerald-500 text-zinc-300 disabled:opacity-0 transition-all rounded-lg sm:rounded-[14px]"
                              >
                                <ArrowUp className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                              </button>
                              <button
                                onClick={() => moveActiveRouteItem(idx, 'down')}
                                disabled={idx === (activeRoute.stops?.length || 0) - 1}
                                className="p-2 sm:p-2.5 hover:bg-white hover:text-emerald-500 text-zinc-300 disabled:opacity-0 transition-all rounded-lg sm:rounded-[14px]"
                              >
                                <ArrowDown className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                              </button>
                              <div className="hidden sm:block h-px bg-zinc-200 mx-2" />
                              <div className="sm:hidden w-px h-4 bg-zinc-200 my-auto mx-1" />
                              <button
                                onClick={() => handleDeleteStop(stop.id)}
                                className="p-2 sm:p-2.5 hover:bg-white hover:text-red-500 text-zinc-300 transition-all rounded-lg sm:rounded-[14px]"
                              >
                                <Trash2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-6 sm:space-y-8">
              <div className="bg-white border border-zinc-200 rounded-[24px] sm:rounded-[40px] p-5 sm:p-8 shadow-sm">
                <h3 className="font-bold text-zinc-800 text-base sm:text-lg mb-4 sm:mb-6 tracking-tight">Expandir Rota</h3>
                <div className="relative mb-6 sm:mb-8">
                  <Search className="w-4 h-4 sm:w-5 sm:h-5 text-zinc-300 absolute left-4 sm:left-5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    className="w-full bg-zinc-50 border-2 border-zinc-100 rounded-[20px] sm:rounded-[28px] pl-11 sm:pl-14 pr-6 py-3 sm:py-4 text-sm font-medium focus:border-emerald-500 focus:bg-white outline-none transition-all shadow-sm"
                  />
                </div>

                <div className="space-y-2 sm:space-y-3 max-h-[400px] sm:max-h-[500px] overflow-y-auto pr-2 sm:pr-3 custom-scrollbar">
                  {customers
                    .filter(c => c.nome.toLowerCase().includes(customerSearch.toLowerCase()))
                    .map(cust => (
                    <button
                      key={cust.id}
                      onClick={() => handleAddCustomerToRoute(cust)}
                      className="w-full flex items-center justify-between p-3 sm:p-6 rounded-[20px] sm:rounded-[32px] border border-zinc-100 hover:border-emerald-400 hover:bg-emerald-50/50 transition-all text-left group active:scale-[0.98]"
                    >
                      <div className="flex items-center gap-3 sm:gap-5 min-w-0">
                        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-xl sm:rounded-3xl bg-zinc-50 flex items-center justify-center group-hover:bg-emerald-100 transition-colors flex-shrink-0">
                          <User className="w-5 h-5 sm:w-7 sm:h-7 text-zinc-300 group-hover:text-emerald-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-zinc-800 text-sm sm:text-base tracking-tight truncate">{cust.nome}</p>
                          <p className="text-[8px] sm:text-[10px] text-zinc-400 font-bold uppercase tracking-widest mt-1 sm:mt-1.5">{cust.bairro || 'Localidade'}</p>
                        </div>
                      </div>
                      <div className="p-2 sm:p-3 bg-zinc-50 rounded-lg sm:rounded-2xl group-hover:bg-emerald-500 group-hover:text-white transition-all shadow-sm">
                        <Plus className="w-4 h-4 sm:w-6 sm:h-6 text-zinc-400 group-hover:text-white" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-[#00a86b] rounded-[24px] sm:rounded-[40px] p-6 sm:p-12 text-white shadow-2xl shadow-emerald-500/40 relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-8 sm:p-12 opacity-10 group-hover:scale-125 transition-transform duration-1000 ease-in-out">
                  <Navigation className="w-32 h-32 sm:w-64 sm:h-64 rotate-45" />
                </div>
                <div className="relative z-10 space-y-6 sm:space-y-10">
                  <div>
                    <h3 className="text-xl sm:text-3xl font-black mb-2 sm:mb-4 tracking-tighter">Próximo Destino</h3>
                    <p className="text-emerald-50 text-[11px] sm:text-sm leading-relaxed opacity-90 font-medium">
                      Inicie o GPS para a próxima cliente. O sistema marcará a cliente atual como visitada automaticamente.
                    </p>
                  </div>
                  <button
                    onClick={handleNextStop}
                    className="w-full py-4 sm:py-6 bg-white text-emerald-600 rounded-2xl sm:rounded-[30px] font-black text-[9px] sm:text-[11px] uppercase tracking-[0.1em] shadow-2xl hover:shadow-white/20 sm:hover:-translate-y-1.5 transition-all flex items-center justify-center gap-3 sm:gap-5 active:scale-[0.97]"
                  >
                    <Play className="w-5 h-5 sm:w-7 sm:h-7 fill-current" />
                    Abrir Navegador GPS
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-8 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-zinc-800 tracking-tight text-center sm:text-left">Rotas de Atendimento</h2>
            <p className="text-sm text-zinc-500 text-center sm:text-left">Organize suas visitas para economizar tempo e combustível.</p>
          </div>
          <button 
            onClick={() => setView('create')}
            className="flex items-center justify-center gap-2 bg-[#00a86b] hover:bg-[#008f5b] text-white px-6 py-2.5 rounded-xl font-bold text-sm transition-all shadow-lg shadow-emerald-500/20 active:scale-95"
          >
            <Plus className="w-5 h-5" />
            Nova Rota
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {loading && routes.length === 0 ? (
            Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white border border-zinc-100 rounded-[24px] sm:rounded-3xl p-5 sm:p-6 shadow-sm animate-pulse">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-2xl bg-zinc-100" />
                  <div className="space-y-2">
                    <div className="h-4 w-32 bg-zinc-100 rounded" />
                    <div className="h-3 w-16 bg-zinc-100 rounded" />
                  </div>
                </div>
                <div className="space-y-2 mb-6">
                  <div className="h-3 w-full bg-zinc-50 rounded" />
                  <div className="h-3 w-full bg-zinc-50 rounded" />
                </div>
                <div className="h-12 w-full bg-zinc-50 rounded-2xl" />
              </div>
            ))
          ) : routes.length === 0 ? (
            <div className="col-span-full py-16 sm:py-20 text-center space-y-4 bg-white border border-zinc-100 border-dashed rounded-[24px] sm:rounded-[32px] px-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-zinc-50 rounded-full flex items-center justify-center mx-auto text-zinc-200">
                <Navigation className="w-8 h-8 sm:w-10 sm:h-10" />
              </div>
              <p className="text-zinc-400 font-medium italic text-sm sm:text-base px-4">Nenhuma rota planejada. Comece criando uma nova!</p>
            </div>
          ) : (
            routes.map(route => (
              <div key={route.id} className="bg-white border border-zinc-100 rounded-[24px] sm:rounded-3xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all group lg:hover:-translate-y-1">
                <div className="flex items-start justify-between mb-4 sm:mb-6">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-[14px] sm:rounded-2xl bg-zinc-50 flex items-center justify-center group-hover:bg-emerald-50 transition-colors flex-shrink-0">
                      <Navigation className="w-5 h-5 text-zinc-400 group-hover:text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-zinc-800 text-sm sm:text-base truncate">{route.name}</h4>
                      <p className="text-[9px] sm:text-[10px] text-zinc-400 uppercase tracking-widest font-black">
                        {route.stops?.length || 0} Paradas
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 ml-2">
                    <span className={cn(
                      "px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md sm:rounded-lg text-[8px] sm:text-[10px] font-bold uppercase tracking-tight",
                      route.status === 'completed' ? "bg-emerald-50 text-emerald-600 border border-emerald-100" : "bg-amber-50 text-amber-600 border border-amber-100"
                    )}>
                      {route.status === 'completed' ? 'Finalizada' : 'Aberta'}
                    </span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setRouteToDelete(route.id);
                        setDeleteModalOpen(true);
                      }}
                      className="p-1.5 sm:p-2 hover:bg-red-50 text-red-400 rounded-lg transition-colors border border-transparent hover:border-red-100"
                      title="Excluir Rota"
                    >
                      <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </button>
                  </div>
                </div>

                <div className="space-y-2 sm:space-y-3 mb-4 sm:mb-6">
                  {(route.stops || []).sort((a,b) => a.order_index - b.order_index).slice(0, 3).map((stop, idx) => (
                    <div key={stop.id} className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-zinc-500">
                      <div className="w-1 h-1 sm:w-1.5 sm:h-1.5 rounded-full bg-zinc-200" />
                      <span className="truncate">{stop.customer?.nome}</span>
                    </div>
                  ))}
                  {(route.stops?.length || 0) > 3 && (
                    <p className="text-[10px] sm:text-xs text-zinc-400 italic pl-3 sm:pl-4 font-medium">+ {(route.stops?.length || 0) - 3} outras paradas</p>
                  )}
                </div>

                <button 
                  onClick={() => {
                    setActiveRoute(route);
                    setView('view');
                  }}
                  className="w-full flex items-center justify-between p-3 sm:p-4 bg-zinc-50 rounded-xl sm:rounded-2xl text-zinc-600 font-bold text-[10px] sm:text-xs hover:bg-zinc-900 hover:text-white transition-all shadow-sm active:scale-[0.98]"
                >
                  {route.status === 'completed' ? 'Ver Detalhes' : 'Continuar Trajeto'}
                  <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const nextStop = activeRoute?.stops
    ?.filter(s => s.status === 'pending')
    .sort((a, b) => a.order_index - b.order_index)[0];

  return (
    <div className="space-y-8 min-h-screen pb-32">
      {renderContent()}

      {/* Global Modals: Always accessible across views */}
      <ConfirmationModal
        isOpen={showEditConfirmModal}
        title="Confirmar Alteração"
        message={`Deseja realmente alterar o nome da rota para "${newRouteName.trim()}"?`}
        confirmText="Confirmar Alteração"
        cancelText="Voltar"
        variant="info"
        onConfirm={handleUpdateRouteName}
        onCancel={() => setShowEditConfirmModal(false)}
      />

      <ConfirmationModal
        isOpen={deleteModalOpen}
        title="Excluir Rota"
        message="Tem certeza que você deseja excluir esta rota? Todas as informações de paradas e agendamentos vinculados serão removidos permanentemente."
        confirmText="Excluir Rota"
        cancelText="Não, manter"
        variant="danger"
        onConfirm={() => routeToDelete && handleDeleteRoute(routeToDelete)}
        onCancel={() => {
          setDeleteModalOpen(false);
          setRouteToDelete(null);
        }}
      />

      {activeRoute && activeRoute.status !== 'completed' && view === 'view' && nextStop && (
        <div className="fixed bottom-6 sm:bottom-12 inset-x-0 flex justify-center z-[100] px-4 sm:px-6 pointer-events-none">
          <button
            onClick={handleNextStop}
            className="pointer-events-auto flex items-center gap-4 sm:gap-6 bg-zinc-900/95 backdrop-blur-xl text-white pl-6 sm:pl-10 pr-5 sm:pr-8 py-4 sm:py-6 rounded-full font-bold shadow-[0_20px_50px_rgba(0,0,0,0.5)] hover:bg-black sm:hover:scale-105 active:scale-95 transition-all animate-in slide-in-from-bottom-20 duration-700 ease-out border border-white/10 group"
          >
            <div className="flex flex-col items-start min-w-[120px] sm:min-w-[150px]">
              <span className="text-[8px] sm:text-[10px] text-zinc-400 uppercase tracking-[0.2em] font-black leading-none mb-1 sm:mb-2">Próxima Visita</span>
              <span className="text-sm sm:text-base truncate max-w-[180px] sm:max-w-[250px] font-bold text-emerald-400 tracking-tight">{nextStop.customer?.nome}</span>
            </div>
            <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-emerald-500 flex items-center justify-center group-hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/40 rotate-0 group-hover:rotate-6 flex-shrink-0">
              <Play className="w-5 h-5 sm:w-7 sm:h-7 text-white fill-current ml-1" />
            </div>
          </button>
        </div>
      )}
    </div>
  );
}

