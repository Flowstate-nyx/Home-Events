/**
 * Check-In Page
 * Manual entry and QR scanner for event check-ins
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth.js';
import { verifyOrder, processCheckIn, getRecentCheckIns } from '../services/checkin.service.js';
import { formatDateTime, formatCurrency } from '../utils/formatters.js';

// Check-in result states
const RESULT_STATES = {
  IDLE: 'idle',
  LOADING: 'loading',
  VERIFIED: 'verified',
  SUCCESS: 'success',
  ERROR: 'error',
  ALREADY_CHECKED: 'already_checked',
};

function CheckIn() {
  const { accessToken } = useAuth();

  // Input state
  const [orderNumber, setOrderNumber] = useState('');
  const [mode, setMode] = useState('manual'); // 'manual' or 'scanner'
  
  // Result state
  const [resultState, setResultState] = useState(RESULT_STATES.IDLE);
  const [orderData, setOrderData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Recent check-ins
  const [recentCheckIns, setRecentCheckIns] = useState([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Scanner state
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  // Input ref for focus
  const inputRef = useRef(null);

  // Load recent check-ins
  const loadRecentCheckIns = useCallback(async () => {
    if (!accessToken) return;

    setLoadingRecent(true);
    try {
      const data = await getRecentCheckIns(accessToken, 10);
      const checkins = data.checkins || data.data || data || [];
      setRecentCheckIns(Array.isArray(checkins) ? checkins : []);
    } catch (err) {
      console.log('Failed to load recent check-ins:', err.message);
    } finally {
      setLoadingRecent(false);
    }
  }, [accessToken]);

  useEffect(() => {
    loadRecentCheckIns();
  }, [loadRecentCheckIns]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Start camera
  const startCamera = async () => {
    setCameraError('');
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      
      setIsCameraActive(true);
    } catch (err) {
      console.error('Camera error:', err);
      setCameraError(
        err.name === 'NotAllowedError' 
          ? 'Camera access denied. Please allow camera permissions.'
          : 'Failed to access camera. Try manual entry instead.'
      );
    }
  };

  // Stop camera
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  // Handle mode change
  const handleModeChange = (newMode) => {
    setMode(newMode);
    resetState();
    
    if (newMode === 'scanner') {
      startCamera();
    } else {
      stopCamera();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Reset state
  const resetState = () => {
    setResultState(RESULT_STATES.IDLE);
    setOrderData(null);
    setErrorMessage('');
    setOrderNumber('');
  };

  // Verify order
  const handleVerify = async (number = orderNumber) => {
    const cleanNumber = number.trim().toUpperCase();
    if (!cleanNumber) return;

    setResultState(RESULT_STATES.LOADING);
    setErrorMessage('');

    try {
      const data = await verifyOrder(accessToken, cleanNumber);
      setOrderData(data.order || data);
      
      // Check if already checked in
      if (data.order?.checked_in || data.checked_in) {
        setResultState(RESULT_STATES.ALREADY_CHECKED);
      } else {
        setResultState(RESULT_STATES.VERIFIED);
      }
    } catch (err) {
      setResultState(RESULT_STATES.ERROR);
      setErrorMessage(err.message);
    }
  };

  // Process check-in
  const handleCheckIn = async () => {
    if (!orderData) return;

    const orderNum = orderData.order_number || orderData.orderNumber;
    setResultState(RESULT_STATES.LOADING);

    try {
      await processCheckIn(accessToken, orderNum);
      setResultState(RESULT_STATES.SUCCESS);
      loadRecentCheckIns();
      
      // Auto reset after 3 seconds
      setTimeout(() => {
        resetState();
        if (mode === 'manual') inputRef.current?.focus();
      }, 3000);
    } catch (err) {
      setResultState(RESULT_STATES.ERROR);
      setErrorMessage(err.message);
    }
  };

  // Handle form submit
  const handleSubmit = (e) => {
    e.preventDefault();
    handleVerify();
  };

  // Handle QR scan result (called when QR is detected)
  const handleScanResult = (result) => {
    if (result && resultState === RESULT_STATES.IDLE) {
      setOrderNumber(result);
      handleVerify(result);
    }
  };

  // Render result card
  const renderResultCard = () => {
    switch (resultState) {
      case RESULT_STATES.LOADING:
        return (
          <div className="card p-8 text-center animate-fade-in">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-brand-gold/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-brand-gold animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
            <p className="text-brand-cream/60">Verifying order...</p>
          </div>
        );

      case RESULT_STATES.VERIFIED:
        return (
          <div className="card p-6 border-blue-500/30 animate-fade-in">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-white mb-1">
                  {orderData?.buyer_name || orderData?.buyerName}
                </h3>
                <p className="text-sm text-gray-400 mb-3">
                  {orderData?.buyer_email || orderData?.buyerEmail}
                </p>
                
                <div className="grid grid-cols-2 gap-3 text-sm mb-4">
                  <div>
                    <span className="text-gray-500">Order:</span>
                    <span className="ml-2 text-white font-mono">{orderData?.order_number || orderData?.orderNumber}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Tickets:</span>
                    <span className="ml-2 text-white">{orderData?.quantity}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Event:</span>
                    <span className="ml-2 text-white">{orderData?.event_name || orderData?.eventName || orderData?.event?.name}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Tier:</span>
                    <span className="ml-2 text-white">{orderData?.tier_name || orderData?.tierName || orderData?.tier?.name}</span>
                  </div>
                </div>

                <div className="flex gap-3">
                  <button onClick={handleCheckIn} className="btn-gold flex-1">
                    <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Confirm Check-In
                  </button>
                  <button onClick={resetState} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        );

      case RESULT_STATES.SUCCESS:
        return (
          <div className="card p-8 text-center border-green-500/30 animate-fade-in">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center animate-bounce">
              <svg className="w-10 h-10 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-green-400 mb-2">Check-In Successful!</h3>
            <p className="text-lg text-white mb-1">{orderData?.buyer_name || orderData?.buyerName}</p>
            <p className="text-brand-cream/60">{orderData?.quantity} ticket(s) • {orderData?.tier_name || orderData?.tierName || orderData?.tier?.name}</p>
          </div>
        );

      case RESULT_STATES.ALREADY_CHECKED:
        return (
          <div className="card p-8 text-center border-yellow-500/30 animate-fade-in">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-yellow-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-yellow-400 mb-2">Already Checked In</h3>
            <p className="text-lg text-white mb-1">{orderData?.buyer_name || orderData?.buyerName}</p>
            <p className="text-brand-cream/60 mb-4">
              Checked in at {formatDateTime(orderData?.checked_in_at || orderData?.checkedInAt)}
            </p>
            <button onClick={resetState} className="btn-secondary">
              Scan Another
            </button>
          </div>
        );

      case RESULT_STATES.ERROR:
        return (
          <div className="card p-8 text-center border-red-500/30 animate-fade-in">
            <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <svg className="w-10 h-10 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-2xl font-bold text-red-400 mb-2">Error</h3>
            <p className="text-brand-cream/60 mb-4">{errorMessage}</p>
            <button onClick={resetState} className="btn-secondary">
              Try Again
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white">Check-In</h2>
        <p className="text-sm text-brand-cream/60">Scan QR codes or enter order numbers</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          onClick={() => handleModeChange('manual')}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
            mode === 'manual'
              ? 'bg-brand-gold text-brand-green'
              : 'bg-brand-green-dark text-gray-400 hover:text-white'
          }`}
        >
          <svg className="w-5 h-5 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
          Manual Entry
        </button>
        <button
          onClick={() => handleModeChange('scanner')}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
            mode === 'scanner'
              ? 'bg-brand-gold text-brand-green'
              : 'bg-brand-green-dark text-gray-400 hover:text-white'
          }`}
        >
          <svg className="w-5 h-5 inline mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
          </svg>
          QR Scanner
        </button>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input Section */}
        <div className="space-y-4">
          {mode === 'manual' ? (
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">Enter Order Number</h3>
              <form onSubmit={handleSubmit}>
                <div className="flex gap-3">
                  <input
                    ref={inputRef}
                    type="text"
                    value={orderNumber}
                    onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                    placeholder="e.g., HP-ABC123"
                    className="input-field flex-1 text-lg font-mono tracking-wider"
                    autoFocus
                    disabled={resultState === RESULT_STATES.LOADING}
                  />
                  <button
                    type="submit"
                    className="btn-gold px-6"
                    disabled={!orderNumber.trim() || resultState === RESULT_STATES.LOADING}
                  >
                    Verify
                  </button>
                </div>
              </form>
              <p className="text-xs text-gray-500 mt-3">
                Enter the order number from the ticket or confirmation email
              </p>
            </div>
          ) : (
            <div className="card p-6">
              <h3 className="text-lg font-semibold text-white mb-4">QR Scanner</h3>
              
              {cameraError ? (
                <div className="aspect-video bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-center">
                  <div className="text-center p-4">
                    <svg className="w-12 h-12 mx-auto text-red-400 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <p className="text-red-400 text-sm">{cameraError}</p>
                    <button onClick={startCamera} className="btn-secondary mt-3 text-sm">
                      Retry Camera
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="aspect-video bg-brand-green-dark rounded-lg overflow-hidden">
                    <video
                      ref={videoRef}
                      className="w-full h-full object-cover"
                      playsInline
                      muted
                    />
                    
                    {/* Scanner overlay */}
                    {isCameraActive && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-48 h-48 border-2 border-brand-gold rounded-lg relative">
                          <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-brand-gold rounded-tl" />
                          <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-brand-gold rounded-tr" />
                          <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-brand-gold rounded-bl" />
                          <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-brand-gold rounded-br" />
                          <div className="absolute inset-0 flex items-center">
                            <div className="w-full h-0.5 bg-brand-gold/50 animate-pulse" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-xs text-gray-500 mt-3 text-center">
                    Position the QR code within the frame
                  </p>
                  
                  {/* Manual entry fallback in scanner mode */}
                  <div className="mt-4 pt-4 border-t border-brand-gold/10">
                    <p className="text-sm text-gray-400 mb-2">Or enter manually:</p>
                    <form onSubmit={handleSubmit} className="flex gap-2">
                      <input
                        type="text"
                        value={orderNumber}
                        onChange={(e) => setOrderNumber(e.target.value.toUpperCase())}
                        placeholder="Order number"
                        className="input-field flex-1 text-sm font-mono"
                      />
                      <button type="submit" className="btn-gold px-4 text-sm">
                        Go
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Result Card */}
          {resultState !== RESULT_STATES.IDLE && renderResultCard()}
        </div>

        {/* Recent Check-ins */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-white">Recent Check-Ins</h3>
            <button
              onClick={loadRecentCheckIns}
              className="text-brand-gold hover:text-brand-gold-light text-sm"
              disabled={loadingRecent}
            >
              {loadingRecent ? 'Loading...' : 'Refresh'}
            </button>
          </div>

          {loadingRecent && recentCheckIns.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-6 h-6 mx-auto text-brand-gold/60 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            </div>
          ) : recentCheckIns.length === 0 ? (
            <div className="text-center py-8">
              <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-gray-500">No check-ins yet</p>
            </div>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {recentCheckIns.map((checkin, index) => (
                <div
                  key={checkin.id || index}
                  className="flex items-center gap-3 p-3 bg-brand-green-dark/50 rounded-lg"
                >
                  <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {checkin.buyer_name || checkin.buyerName || checkin.order?.buyer_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {checkin.order_number || checkin.orderNumber || checkin.order?.order_number} • {checkin.quantity || checkin.order?.quantity} ticket(s)
                    </p>
                  </div>
                  <div className="text-xs text-gray-500 text-right">
                    {formatDateTime(checkin.checked_in_at || checkin.checkedInAt || checkin.created_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Instructions */}
      <div className="card p-4 bg-brand-gold/5 border-brand-gold/20">
        <h4 className="text-sm font-semibold text-brand-gold mb-2">Quick Tips</h4>
        <ul className="text-sm text-brand-cream/60 space-y-1">
          <li>• Order numbers start with "HP-" followed by letters and numbers</li>
          <li>• QR codes contain the order number - just point and scan</li>
          <li>• Each order can only be checked in once</li>
          <li>• Paid orders only - pending orders cannot check in</li>
        </ul>
      </div>
    </div>
  );
}

export default CheckIn;
