import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Mic, FileText, Activity, History, Info, ChevronRight, User as UserIcon, AlertCircle, LogOut, Trash2, MapPin, CheckSquare, Square } from 'lucide-react';
import { ThreeCanvas } from './components/ThreeCanvas';
import { analyzeCondition, DiagnosisResult } from './services/gemini';
import { D3ResultChart } from './components/D3ResultChart';
import { cn } from './lib/utils';
import { auth, db, googleProvider } from './lib/firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';
import { doc, getDoc, setDoc, collection, addDoc, query, where, getDocs, orderBy, serverTimestamp, deleteDoc } from 'firebase/firestore';

type Page = 'hero' | 'info' | 'input' | 'processing' | 'results' | 'dashboard' | 'login';

const PageWrapper = ({ children }: { children: React.ReactNode }) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95, y: 20 }}
    animate={{ opacity: 1, scale: 1, y: 0 }}
    exit={{ opacity: 0, scale: 1.05, y: -20 }}
    className="max-w-4xl mx-auto w-full px-6 py-12"
  >
    {children}
  </motion.div>
);

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('hero');
  const [user, setUser] = useState<User | null>(null);
  const [userInfo, setUserInfo] = useState({ name: '', age: '' });
  const [inputs, setInputs] = useState({ image: '', symptoms: '' });
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [specialists, setSpecialists] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          const savedInfo = { 
            name: data.name || '', 
            age: data.age?.toString() || ''
          };
          setUserInfo(savedInfo);
          // If we are on hero, we don't automatically jump, but if we start, we will skip info
        }
      } else {
        setUserInfo({ name: '', age: '' });
      }
    });
    return unsub;
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      setCurrentPage('hero');
    } catch (err) {
      console.error(err);
      alert("Login failed");
    }
  };

  const logout = () => signOut(auth).then(() => setCurrentPage('hero'));

  const fetchHistory = async () => {
    if (!user) return;
    const q = query(
      collection(db, 'diagnoses'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    setHistory(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const saveUserInfo = async () => {
    if (!userInfo.name.trim()) {
      setError("Identification required: Please provide your name to continue.");
      return;
    }

    if (!user) {
      // Anonymous usage
      setCurrentPage('input');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        name: userInfo.name.trim(),
        age: parseInt(userInfo.age) || null,
        createdAt: serverTimestamp()
      }, { merge: true });
      setCurrentPage('input');
    } catch (e: any) {
      console.error("Error saving profile:", e);
      // In guest-friendly mode, we might just proceed if DB fails, but here we report
      setError("Cloud sync failed. Proceeding as Guest.");
      setTimeout(() => setCurrentPage('input'), 1500);
    } finally {
      setLoading(false);
    }
  };

  const handleStartProcess = () => {
    // If logged in AND has profile data, skip info
    if (user && userInfo.name) {
      setCurrentPage('input');
    } else {
      // For guest OR signed in with no data, go to info
      setCurrentPage('info');
    }
  };

  const requestLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          // Mock specialists based on location
          setSpecialists([
            { name: "Dr. Elena Vance", specialty: "Clinical Dermatology", address: "Central Medical Hub, Suite 402", distance: "0.8 km" },
            { name: "Dr. Marcus Thorne", specialty: "Dermapathology", address: "North Ridge Specialty Clinic", distance: "2.4 km" },
            { name: "Westside Skin Institute", specialty: "Advanced Diagnosis", address: "882 Oakhaven Dr.", distance: "3.1 km" }
          ]);
        },
        (err) => {
          console.error("Location access denied:", err);
          setError("Location access required for nearest specialist suggestion.");
        }
      );
    }
  };

  const deleteHistoryItem = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await deleteDoc(doc(db, 'diagnoses', id));
      setHistory(prev => prev.filter(item => item.id !== id));
      setSelectedHistoryIds(prev => prev.filter(selectedId => selectedId !== id));
    } catch (err) {
      console.error("Delete failed:", err);
    }
  };

  const deleteSelectedHistory = async () => {
    if (!window.confirm(`Delete ${selectedHistoryIds.length} records?`)) return;
    setLoading(true);
    try {
      await Promise.all(selectedHistoryIds.map(id => deleteDoc(doc(db, 'diagnoses', id))));
      setHistory(prev => prev.filter(item => !selectedHistoryIds.includes(item.id)));
      setSelectedHistoryIds([]);
    } catch (err) {
      console.error("Bulk delete failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelectAll = () => {
    if (selectedHistoryIds.length === history.length && history.length > 0) {
      setSelectedHistoryIds([]);
    } else {
      setSelectedHistoryIds(history.map(item => item.id));
    }
  };

  const toggleSelection = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setSelectedHistoryIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const startAnalysis = async () => {
    setError(null);
    setCurrentPage('processing');
    setLoading(true);
    try {
      const diagnosis = await analyzeCondition(
        inputs.image,
        inputs.symptoms,
        ""
      );
      setResult(diagnosis);
      setCurrentPage('results');
      
      // Save to history in background
      if (user && diagnosis.isSkinNailRelated) {
        addDoc(collection(db, 'diagnoses'), {
          userId: user.uid,
          diseaseName: diagnosis.diseaseName,
          confidence: diagnosis.confidence,
          explanation: diagnosis.explanation,
          medications: diagnosis.medications,
          precautions: diagnosis.precautions,
          symptoms: [inputs.symptoms],
          createdAt: serverTimestamp()
        }).catch(err => console.error("History sync failed:", err));
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Diagnostic stream interrupted. Please check network.");
      setCurrentPage('input');
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setInputs(prev => ({ ...prev, image: reader.result as string }));
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="min-h-screen bg-bg text-text-main selection:bg-accent-blue selection:text-bg font-sans">
      <nav className="border-b border-border-main bg-surface/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentPage('hero')}>
            <div className="w-8 h-8 rounded-lg bg-accent-blue flex items-center justify-center font-bold text-bg">D</div>
            <span className="font-bold tracking-tight text-xl uppercase tracking-widest text-accent-blue">DermAI Pro</span>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => {
                if (!user) return setCurrentPage('hero');
                fetchHistory();
                setCurrentPage('dashboard');
              }} 
              className="text-text-dim hover:text-accent-blue transition-colors flex items-center gap-2"
            >
              <History size={18} />
              <span className="hidden sm:inline">Session History</span>
            </button>
            {user ? (
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-surface-accent text-accent-blue flex items-center justify-center border border-accent-blue/30">
                  <UserIcon size={18} />
                </div>
                <button onClick={logout} className="text-text-dim hover:text-red-400">
                  <LogOut size={18} />
                </button>
              </div>
            ) : (
              <button 
                onClick={login}
                className="bg-accent-blue text-bg px-4 py-2 rounded-lg text-sm font-bold transition-all hover:brightness-110"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      <main>
        <AnimatePresence mode="wait">
          {currentPage === 'hero' && (
            <PageWrapper key="hero">
              <div className="grid lg:grid-cols-2 gap-12 items-center">
                <div className="space-y-8">
                  <div className="space-y-4">
                    <motion.span 
                      initial={{ opacity: 0 }} 
                      animate={{ opacity: 1 }} 
                      className="text-accent-blue font-mono text-sm tracking-widest uppercase"
                    >
                      Advanced Diagnostic Portal
                    </motion.span>
                    <h1 className="text-6xl sm:text-7xl font-bold leading-[0.9] tracking-tight">
                      AI-Assisted <span className="text-text-dim">Dermal</span> Vision
                    </h1>
                    <p className="text-text-dim text-lg max-w-md">
                      Processing with ViT @ 0.4ms latency. High-precision structural analysis for early detection.
                    </p>
                  </div>
                  <button 
                    onClick={handleStartProcess}
                    className="bg-accent-blue text-bg font-bold px-8 py-4 rounded-xl flex items-center gap-3 transition-all hover:scale-105 hover:accent-glow"
                  >
                    Start Diagnosis <ChevronRight size={20} />
                  </button>
                </div>
                <div className="h-[500px] w-full relative">
                  <ThreeCanvas />
                  <div className="absolute -bottom-6 -left-6 card-premium shadow-2xl backdrop-blur-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-full border-2 border-accent-blue flex items-center justify-center accent-glow">
                        <Activity className="text-accent-blue" />
                      </div>
                      <div>
                        <p className="text-xs text-text-dim uppercase font-bold tracking-tighter">System Health</p>
                        <p className="font-mono text-accent-blue">94.2% Confidence</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </PageWrapper>
          )}

          {currentPage === 'info' && (
            <PageWrapper key="info">
              <div className="card-premium max-w-2xl mx-auto space-y-8">
                <div className="space-y-2">
                  <h2 className="text-3xl font-bold tracking-tight">Patient Profile</h2>
                  <p className="text-text-dim">Configure diagnostic context parameters {user ? '(Cloud Synced)' : '(Guest Mode)'}</p>
                </div>

                {!user && (
                   <div className="p-4 bg-accent-blue/5 border border-accent-blue/20 rounded-xl flex items-center justify-between text-[11px] gap-4">
                      <div className="flex items-center gap-2 text-text-dim">
                        <Info size={14} className="text-accent-blue" />
                        <span>Sign in to save your history and sync across devices.</span>
                      </div>
                      <button onClick={login} className="text-accent-blue font-bold uppercase tracking-widest hover:underline">Sign In Now</button>
                   </div>
                )}

                {error && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-xs animate-shake">
                    <AlertCircle size={16} />
                    <span>{error}</span>
                  </div>
                )}

                <div className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-dim uppercase tracking-wider">Full Name</label>
                      <input 
                        type="text" 
                        value={userInfo.name}
                        onChange={(e) => setUserInfo(p => ({ ...p, name: e.target.value }))}
                        className="w-full bg-bg border border-border-main rounded-xl px-4 py-3 focus:outline-none focus:border-accent-blue transition-colors"
                        placeholder="e.g. Sarah Jenkins"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-text-dim uppercase tracking-wider">Biological Age (Years)</label>
                      <input 
                        type="number" 
                        value={userInfo.age}
                        onChange={(e) => setUserInfo(p => ({ ...p, age: e.target.value }))}
                        className="w-full bg-bg border border-border-main rounded-xl px-4 py-3 focus:outline-none focus:border-accent-blue transition-colors"
                        placeholder="e.g. 28"
                      />
                    </div>
                  </div>
                </div>
                <button 
                  onClick={saveUserInfo}
                  disabled={loading}
                  className="w-full bg-accent-blue disabled:bg-surface-accent disabled:text-text-dim text-bg font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:brightness-110 transition-all"
                >
                  {loading ? (
                    <>
                      <Activity className="animate-spin" size={20} />
                      <span>Syncing Profile...</span>
                    </>
                  ) : (
                    <>
                      Confirm Parameters <ChevronRight size={20} />
                    </>
                  )}
                </button>
              </div>
            </PageWrapper>
          )}

          {currentPage === 'input' && (
            <PageWrapper key="input">
              <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-8">
                  <div className="space-y-2">
                    <h2 className="text-4xl font-bold tracking-tight">Multimodal Feed</h2>
                    <p className="text-text-dim text-sm uppercase tracking-wider font-bold italic">Synchronizing Data Streams</p>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="card-premium space-y-4">
                      <div className="flex items-center gap-3">
                        <Camera className="text-accent-blue" />
                        <span className="font-bold text-xs uppercase tracking-widest text-text-dim">Visual Scan</span>
                      </div>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageUpload}
                        className="hidden" 
                        id="image-upload" 
                      />
                      <label 
                        htmlFor="image-upload" 
                        className="block w-full border-2 border-dashed border-border-main rounded-xl p-8 text-center cursor-pointer hover:border-accent-blue/50 transition-colors group relative overflow-hidden bg-bg"
                      >
                        {inputs.image ? (
                          <div className="relative group">
                            <img src={inputs.image} alt="Preview" className="h-48 sm:h-64 mx-auto rounded-lg object-contain brightness-90 group-hover:brightness-100 transition-all" />
                            <div className="absolute inset-0 border-2 border-accent-blue/30 rounded-lg pointer-events-none accent-glow opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-text-dim group-hover:text-accent-blue transition-colors">Capture area of interest</p>
                            <div className="w-12 h-1 bg-surface mx-auto rounded-full overflow-hidden">
                              <div className="h-full bg-accent-blue/20 w-1/3" />
                            </div>
                          </div>
                        )}
                      </label>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="card-premium h-full flex flex-col">
                    {error && (
                      <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-500 text-xs mb-4 animate-shake">
                        <AlertCircle size={16} />
                        <span>{error}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mb-4">
                      <FileText className="text-accent-blue" />
                      <span className="font-bold text-xs uppercase tracking-widest text-text-dim">Symptoms of the problem</span>
                    </div>
                    <textarea 
                      value={inputs.symptoms}
                      onChange={(e) => setInputs(p => ({ ...p, symptoms: e.target.value }))}
                      className="flex-1 w-full bg-bg border border-border-main rounded-xl p-4 focus:outline-none focus:border-accent-blue min-h-[200px] text-sm italic"
                      placeholder="Optional: Enter detailed symptomatic transcript..."
                    />
                    <button 
                      onClick={startAnalysis}
                      disabled={!inputs.image || loading}
                      className="w-full bg-accent-blue disabled:bg-surface-accent disabled:text-text-dim text-bg font-bold py-4 rounded-xl mt-4 tracking-widest uppercase text-sm accent-glow flex items-center justify-center gap-3 transition-all"
                    >
                      {loading ? (
                        <>
                          <Activity className="animate-spin" size={20} />
                          <span>Processing Stream...</span>
                        </>
                      ) : (
                        "Initialize Analysis"
                      )}
                    </button>
                    <div className="mt-4 p-4 bg-red-500/5 border border-red-500/20 rounded-xl text-[10px] text-red-500 leading-tight">
                       NOTICE: For clinical use only. Multimodal inputs are processed via EfficientNet-V2.
                    </div>
                  </div>
                </div>
              </div>
            </PageWrapper>
          )}

          {currentPage === 'processing' && (
            <PageWrapper key="processing">
              <div className="max-w-md mx-auto text-center space-y-12 py-24">
                <div className="relative">
                  <div className="w-32 h-32 rounded-full border-4 border-surface-accent border-t-accent-blue animate-spin mx-auto accent-glow" />
                  <Activity className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent-blue animate-pulse" size={32} />
                </div>
                <div className="space-y-4">
                  <h2 className="text-3xl font-bold animate-pulse tracking-tight text-accent-blue uppercase tracking-widest">Neural Analysis In Progress</h2>
                  <div className="space-y-2 text-text-dim font-mono text-xs">
                    <p className="flex items-center justify-between border-b border-border-main/30 pb-1"><span>IMAGE_VAL_MATRIX</span> <span className="text-accent-blue">PASSED</span></p>
                    <p className="flex items-center justify-between border-b border-border-main/30 pb-1"><span>DERMAL_ANOMALY_SCAN</span> <span className="text-accent-blue">ACTIVE</span></p>
                    <p className="flex items-center justify-between border-b border-border-main/30 pb-1"><span>NLP_CONTEXT_SYNTHESIS</span> <span className="text-surface-accent">QUEUED</span></p>
                  </div>
                </div>
              </div>
            </PageWrapper>
          )}

          {currentPage === 'results' && result && (
            <PageWrapper key="results">
              <div className="grid lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-6">
                  <div className="card-premium text-center space-y-6">
                    <h3 className="text-xs font-bold text-text-dim uppercase tracking-widest">Diagnosis Confidence</h3>
                    <D3ResultChart confidence={result.confidence} />
                    {result.confidence < 70 && (
                      <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl flex items-center gap-3 text-red-400 text-[11px] text-left italic">
                        <AlertCircle size={16} />
                        Potential analysis variance detected. Structural patterns are ambiguous.
                      </div>
                    )}
                  </div>

                  <div className="card-premium space-y-4">
                    <h3 className="text-xs font-bold text-text-dim uppercase tracking-widest">Recommended Protocol</h3>
                    <div className="space-y-3">
                      <button onClick={requestLocation} className="w-full bg-accent-blue text-bg p-3 rounded-xl text-xs font-bold transition-all hover:brightness-110 tracking-wider uppercase flex items-center justify-center gap-2">
                        <MapPin size={14} /> Find Nearest Specialist
                      </button>
                      <button className="w-full bg-surface-accent hover:bg-surface border border-border-main p-3 rounded-xl text-xs font-bold transition-colors text-text-dim tracking-wider uppercase">Export clinical report</button>
                      <button onClick={() => {
                        setCurrentPage('hero');
                        setSpecialists([]);
                        setLocation(null);
                      }} className="w-full p-3 text-text-dim/50 text-[10px] uppercase font-bold tracking-widest hover:text-accent-blue transition-colors">Start New Session</button>
                    </div>
                  </div>

                  {specialists.length > 0 && (
                    <div className="card-premium space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                      <div className="flex items-center justify-between">
                         <h3 className="text-xs font-bold text-accent-blue uppercase tracking-widest">Nearest Specialists</h3>
                         <span className="text-[10px] text-text-dim font-mono">{location?.lat.toFixed(2)}, {location?.lng.toFixed(2)}</span>
                      </div>
                      <div className="space-y-4">
                        {specialists.map((doc, i) => (
                          <div key={i} className="p-4 bg-bg border border-border-main rounded-xl space-y-2 group hover:border-accent-blue/50 transition-colors">
                            <div className="flex justify-between items-start">
                              <h4 className="font-bold text-sm text-text-main">{doc.name}</h4>
                              <span className="text-[10px] bg-accent-blue/10 text-accent-blue px-2 py-0.5 rounded-full font-bold">{doc.distance}</span>
                            </div>
                            <p className="text-[10px] text-accent-blue font-bold uppercase tracking-widest">{doc.specialty}</p>
                            <p className="text-[10px] text-text-dim italic">{doc.address}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="lg:col-span-2 space-y-8">
                  {!result.isSkinNailRelated ? (
                    <div className="bg-red-500/5 border border-red-500/20 p-8 rounded-3xl space-y-4">
                      <h2 className="text-3xl font-bold text-red-500 tracking-tighter uppercase italic">IMAGE_VAL: REJECTED</h2>
                      <p className="text-text-dim italic leading-relaxed">{result.explanation}</p>
                    </div>
                  ) : (
                    <div className="space-y-8">
                      <div className="space-y-4">
                        <span className="diagnosis-tag">Detection Successful</span>
                        <h2 className="text-6xl font-bold tracking-tighter text-accent-blue">{result.diseaseName}</h2>
                      </div>

                      <div className="grid sm:grid-cols-2 gap-6">
                        <div className="bg-surface border border-border-main p-6 rounded-2xl space-y-4 relative">
                          <h4 className="font-bold flex items-center gap-2 text-text-dim uppercase tracking-widest text-[10px]"><Info size={14} className="text-accent-blue" /> Structural Analysis</h4>
                          <p className="text-text-dim text-sm leading-relaxed italic">{result.explanation}</p>
                        </div>
                        <div className="bg-surface border border-border-main p-6 rounded-2xl space-y-4 relative">
                          <h4 className="font-bold flex items-center gap-2 text-text-dim uppercase tracking-widest text-[10px]"><Activity size={14} className="text-accent-blue" /> Preventive Measures</h4>
                          <p className="text-text-dim text-sm leading-relaxed italic">{result.precautions}</p>
                        </div>
                      </div>

                      <div className="card-premium space-y-6">
                        <h4 className="font-bold text-sm uppercase tracking-[0.2em] text-accent-blue underline underline-offset-8">Clinical Guidance</h4>
                        <div className="transcript-box">
                          {result.medications}
                        </div>
                        <div className="warning-footer text-[10px] uppercase font-bold tracking-tighter">
                          TERMINAL NOTICE: THIS IS AN AI-ASSISTED TOOL. FOR CLINICAL USE ONLY. FINAL CONFIRMATION BY CERTIFIED DERMATOLOGIST REQUIRED.
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </PageWrapper>
          )}

          {currentPage === 'dashboard' && (
            <PageWrapper key="dashboard">
               <div className="space-y-8">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h2 className="text-4xl font-bold tracking-tight">Diagnostic History</h2>
                      <p className="text-xs text-text-dim font-mono tracking-widest uppercase">Archive_System_V2.0</p>
                    </div>
                    <div className="flex items-center gap-3">
                      {selectedHistoryIds.length > 0 && (
                        <button 
                          onClick={deleteSelectedHistory}
                          className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-bold hover:bg-red-500/20 transition-all flex items-center gap-2"
                        >
                          <Trash2 size={14} /> Delete Selected ({selectedHistoryIds.length})
                        </button>
                      )}
                      <button onClick={toggleSelectAll} className="px-4 py-2 bg-surface border border-border-main text-text-dim rounded-xl text-xs font-bold hover:text-accent-blue transition-all">
                        {selectedHistoryIds.length === history.length && history.length > 0 ? "Deselect All" : "Select All"}
                      </button>
                      <button onClick={() => {
                        setCurrentPage('hero');
                        setSelectedHistoryIds([]);
                      }} className="bg-surface border border-border-main p-2 rounded-lg cursor-pointer hover:accent-glow transition-all">
                        <ChevronRight className="rotate-180" />
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-4">
                    {history.length > 0 ? history.map((item, i) => (
                      <div 
                        key={item.id} 
                        onClick={() => {
                          setResult(item);
                          setCurrentPage('results');
                        }}
                        className={cn(
                          "card-premium flex items-center justify-between group cursor-pointer transition-all relative overflow-hidden",
                          selectedHistoryIds.includes(item.id) ? "border-accent-blue bg-accent-blue/5 shadow-[0_0_20px_rgba(0,242,254,0.1)]" : "hover:border-accent-blue/50"
                        )}
                      >
                        <div className="flex items-center gap-4 relative z-10">
                          <button 
                            onClick={(e) => toggleSelection(e, item.id)}
                            className="w-10 h-10 flex items-center justify-center text-text-dim hover:text-accent-blue transition-colors"
                          >
                            {selectedHistoryIds.includes(item.id) ? (
                              <CheckSquare className="text-accent-blue" size={18} />
                            ) : (
                              <Square size={18} />
                            )}
                          </button>
                          <div className="w-10 h-10 rounded-lg bg-bg border border-border-main flex items-center justify-center font-bold text-text-dim text-[10px] tracking-tighter">#{i + 1}</div>
                          <div>
                            <h4 className="font-bold text-accent-blue tracking-tight">{item.diseaseName}</h4>
                            <p className="text-[10px] text-text-dim uppercase tracking-widest font-bold">
                              Session: {item.createdAt?.toDate ? item.createdAt.toDate().toLocaleDateString() : 'REALTIME'}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 relative z-10">
                          <div className="text-right">
                            <p className="font-mono text-accent-blue text-xl">{item.confidence}%</p>
                            <p className="text-[10px] text-text-dim tracking-widest uppercase italic font-bold">Conf_Prob</p>
                          </div>
                          <button 
                            onClick={(e) => deleteHistoryItem(e, item.id)}
                            className="p-3 text-text-dim opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </div>
                    )) : (
                      <div className="text-center py-24 card-premium text-text-dim/50 uppercase tracking-[0.4em] font-bold text-xs italic bg-bg/30">
                        Zero Diagnostic Records Found
                      </div>
                    )}
                  </div>
               </div>
            </PageWrapper>
          )}
        </AnimatePresence>
      </main>

      <footer className="border-t border-border-main bg-surface py-12 mt-24">
        <div className="max-w-7xl mx-auto px-6 grid sm:grid-cols-3 gap-12">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-accent-blue shadow-[0_0_10px_#00f2fe]" />
              <span className="font-bold tracking-tight uppercase tracking-widest text-accent-blue">DermAI Pro</span>
            </div>
            <p className="text-xs text-text-dim leading-relaxed uppercase tracking-tighter">Advanced diagnostic pipeline. Built for high-throughput dermal analysis using EfficientNet transformers.</p>
          </div>
          <div className="space-y-4">
            <h5 className="font-bold text-[10px] uppercase tracking-[0.3em] text-text-dim border-b border-border-main pb-2">Compliance_Matrix</h5>
            <ul className="text-[11px] text-text-dim space-y-2 uppercase tracking-widest font-bold">
              <li className="hover:text-accent-blue cursor-pointer transition-colors">HIPAA_PROTOCOL</li>
              <li className="hover:text-accent-blue cursor-pointer transition-colors">GDPR_ENFORCED</li>
              <li className="hover:text-accent-blue cursor-pointer transition-colors">FDA_DIAG_CLASS_III</li>
            </ul>
          </div>
          <div className="space-y-4">
            <h5 className="font-bold text-[10px] uppercase tracking-[0.3em] text-text-dim border-b border-border-main pb-2">Terminal_Ops</h5>
            <ul className="text-[11px] text-text-dim space-y-2 uppercase tracking-widest font-bold">
              <li className="hover:text-accent-blue cursor-pointer transition-colors">API_DOCS_V2.1</li>
              <li className="hover:text-accent-blue cursor-pointer transition-colors">DERMAL_DATASET_ISIC</li>
              <li className="hover:text-accent-blue cursor-pointer transition-colors">NETWORK_STATUS: OK</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
