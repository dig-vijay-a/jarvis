import React, { useState, useEffect, useCallback, useRef } from 'react';
import Header from './components/layout/Header';
import Sidebar from './components/layout/Sidebar';
import EmergencyModal from './components/common/EmergencyModal';
import ScreenIntelligenceModal from './components/vision/ScreenIntelligenceModal';
import GlobalCommandModal from './components/common/GlobalCommandModal';
import OnboardingModal from './components/common/OnboardingModal';

import DashboardPage from './pages/DashboardPage';
import ChatPage from './pages/ChatPage';
import MemoryPage from './pages/MemoryPage';
import AutomationsPage from './pages/AutomationsPage';
import ComputerControlPage from './pages/ComputerControlPage';
import ResearchPage from './pages/ResearchPage';
import SettingsPage from './pages/SettingsPage';
import MissionControlPage from './pages/MissionControlPage';
import IntelligenceHubPage from './pages/IntelligenceHubPage';
import SentinelLivePage from './pages/SentinelLivePage';
import DeviceDashboardPage from './pages/DeviceDashboardPage';
import AegisTestingPage from './pages/AegisTestingPage';
import { LayoutDashboard, Rocket, MessageSquareCode, BrainCircuit, SlidersHorizontal, Workflow } from 'lucide-react';

import { useVoiceAssistant } from './hooks/useVoiceAssistant';
import novaSocket from './services/websocket';
import {
  getConversations,
  createConversation,
  deleteConversation,
  getMessages,
  sendMessage,
  getTasks,
  updateTask,
  getMemories,
  getActivityLogs,
  getSystemStatus,
  getSettings,
  triggerEmergencyStop
} from './services/api';

export function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [wsConnected, setWsConnected] = useState(false);
  const [isEmergencyModalOpen, setIsEmergencyModalOpen] = useState(false);
  const [isVisionModalOpen, setIsVisionModalOpen] = useState(false);
  const [isCommandModalOpen, setIsCommandModalOpen] = useState(false);
  const [isOnboardingModalOpen, setIsOnboardingModalOpen] = useState(false);

  // Core Data
  const [conversations, setConversations] = useState([]);
  const [currentConversationId, setCurrentConversationId] = useState('conv-main');
  const [messages, setMessages] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [memories, setMemories] = useState([]);
  const [logs, setLogs] = useState([]);
  const [systemStatus, setSystemStatus] = useState(null);
  const [settings, setSettings] = useState({});
  const [aiState, setAiState] = useState('idle');

  // Multi-Agent & Orchestrator State (Phase 2)
  const [activeAgent, setActiveAgent] = useState('JARVIS Core');
  const [memoryActivity, setMemoryActivity] = useState(null);
  const [pendingApproval, setPendingApproval] = useState(null);

  // Reference to TTS speak function to avoid circular closures
  const speakRef = useRef(null);

  // Send message handler forward-declaration
  const handleSendMessage = useCallback(async (text) => {
    if (!text || !text.trim()) return;

    setAiState('thinking');
    try {
      const res = await sendMessage(currentConversationId, text);
      if (res.data.success) {
        if (res.data.activeAgent) {
          setActiveAgent(res.data.activeAgent);
        }
        if (res.data.pendingApproval) {
          setPendingApproval(res.data.pendingApproval);
        }

        // Refresh conversation messages list
        loadMessages(currentConversationId);

        // Vocalize assistant reply if TTS is enabled
        if (settings.tts_enabled !== 'false' && speakRef.current) {
          speakRef.current(res.data.content, () => {
            setAiState('idle');
          });
        } else {
          setAiState('idle');
        }
      } else {
        setAiState('idle');
      }
    } catch (err) {
      console.error('Error sending message to JARVIS:', err);
      setAiState('idle');
    }
  }, [currentConversationId, settings]);

  // Voice Assistant Hook with Local Wake-Word & Bilingual Support (Module 7)
  const {
    isListening,
    isSpeaking,
    transcript,
    permissionError,
    clearPermissionError,
    audioLevel,
    language,
    toggleLanguage,
    isMicMuted,
    toggleMicMute,
    wakeWordEnabled,
    wakeWordPhrase,
    wakeWordDetected,
    startListening,
    stopListening,
    toggleListening,
    speak,
    stopSpeaking,
    playHudBeep
  } = useVoiceAssistant({
    onCommandReceived: useCallback((commandText) => {
      console.log('[App] Voice Command received:', commandText);
      handleSendMessage(commandText);
    }, [handleSendMessage]),
    settings
  });

  useEffect(() => {
    speakRef.current = speak;
  }, [speak]);

  // Global Ctrl+K command bar hotkey listener
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandModalOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Check first-time user tour status
  useEffect(() => {
    const completed = localStorage.getItem('nova_onboarding_completed');
    if (!completed) {
      setIsOnboardingModalOpen(true);
    }
  }, []);

  // Load Initial Data
  const loadInitialData = async () => {
    try {
      const [convRes, tasksRes, memRes, logsRes, statusRes, setRes] = await Promise.allSettled([
        getConversations(),
        getTasks({ status: 'all' }),
        getMemories(),
        getActivityLogs(40),
        getSystemStatus(),
        getSettings()
      ]);

      if (convRes.status === 'fulfilled' && convRes.value.data.success) {
        const convs = convRes.value.data.conversations || [];
        setConversations(convs);
        if (convs.length > 0) {
          setCurrentConversationId(convs[0].id);
        }
      }

      if (tasksRes.status === 'fulfilled' && tasksRes.value.data.success) {
        setTasks(tasksRes.value.data.tasks || []);
      }

      if (memRes.status === 'fulfilled' && memRes.value.data.success) {
        setMemories(memRes.value.data.memories || []);
      }

      if (logsRes.status === 'fulfilled' && logsRes.value.data.success) {
        setLogs(logsRes.value.data.logs || []);
      }

      if (statusRes.status === 'fulfilled') {
        setSystemStatus(statusRes.value.data);
      }

      if (setRes.status === 'fulfilled' && setRes.value.data.success) {
        setSettings(setRes.value.data.settings || {});
      }
    } catch (e) {
      console.error('Failed to load initial data:', e);
    }
  };

  // Load Messages when current conversation changes
  const loadMessages = async (convId) => {
    if (!convId) return;
    try {
      const res = await getMessages(convId);
      if (res.data.success) {
        setMessages(res.data.messages || []);
      }
    } catch (e) {
      console.error('Failed to load messages for conversation:', convId, e);
    }
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (currentConversationId) {
      loadMessages(currentConversationId);
    }
  }, [currentConversationId]);

  // Connect WebSocket & Listen to Real-time Events
  useEffect(() => {
    novaSocket.connect();

    const unsubStatus = novaSocket.on('STATUS_CHANGE', ({ connected }) => {
      setWsConnected(connected);
    });

    const unsubMsg = novaSocket.on('NEW_MESSAGE', (msg) => {
      if (msg.conversationId === currentConversationId) {
        setMessages(prev => {
          if (prev.some(m => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      }
      if (msg.pendingApproval) {
        setPendingApproval(msg.pendingApproval);
      }
      setAiState('idle');
    });

    const unsubAi = novaSocket.on('AI_STATE_CHANGE', (data) => {
      setAiState(data.state);
      if (data.agent) setActiveAgent(data.agent);
    });

    const unsubAgent = novaSocket.on('ACTIVE_AGENT_CHANGE', (data) => {
      setActiveAgent(data.agentName);
    });

    const unsubMemActivity = novaSocket.on('MEMORY_RETRIEVAL_EVENT', (data) => {
      setMemoryActivity(data);
      setTimeout(() => setMemoryActivity(null), 8000);
    });

    const unsubApproval = novaSocket.on('WAITING_FOR_APPROVAL', (data) => {
      setPendingApproval(data);
    });

    const unsubLog = novaSocket.on('NEW_ACTIVITY_LOG', (log) => {
      setLogs(prev => [log, ...prev.slice(0, 50)]);
    });

    const unsubReminder = novaSocket.on('REMINDER_TRIGGERED', (rem) => {
      playHudBeep('activate');
      if (rem.spoken_text && settings.tts_enabled !== 'false') {
        speak(rem.spoken_text);
      }
      getTasks({ status: 'all' }).then(r => r.data.success && setTasks(r.data.tasks));
    });

    return () => {
      unsubStatus();
      unsubMsg();
      unsubAi();
      unsubAgent();
      unsubMemActivity();
      unsubApproval();
      unsubLog();
      unsubReminder();
    };
  }, [currentConversationId, settings, speak, playHudBeep]);

  // Keyboard shortcut listener for tabs (1 to 7)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (['INPUT', 'TEXTAREA'].includes(e.target.tagName)) return;

      const tabMap = {
        '1': 'dashboard',
        '2': 'missions',
        '3': 'intelligence',
        '4': 'chat',
        '5': 'memory',
        '6': 'automations',
        '7': 'computer',
        '8': 'research',
        '9': 'settings'
      };

      if (tabMap[e.key]) {
        setActiveTab(tabMap[e.key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Conversation Actions
  const handleCreateConversation = async () => {
    try {
      const res = await createConversation(`Session ${conversations.length + 1}`);
      if (res.data.success) {
        setConversations(prev => [res.data.conversation, ...prev]);
        setCurrentConversationId(res.data.conversation.id);
        setActiveTab('chat');
      }
    } catch (e) {
      alert('Error creating conversation: ' + e.message);
    }
  };

  const handleDeleteConversation = async (convId) => {
    try {
      await deleteConversation(convId);
      const remaining = conversations.filter(c => c.id !== convId);
      setConversations(remaining);
      if (remaining.length > 0) {
        setCurrentConversationId(remaining[0].id);
      }
    } catch (e) {
      alert('Error deleting conversation: ' + e.message);
    }
  };

  const handleToggleTask = async (task) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      await updateTask(task.id, { status: newStatus });
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    } catch (e) {
      console.error('Error toggling task:', e);
    }
  };

  const handleExecuteEmergencyStop = async () => {
    try {
      stopSpeaking();
      stopListening();
      await triggerEmergencyStop();
      alert('EMERGENCY SHUTDOWN ENGAGED. All running agent tasks have been halted.');
    } catch (e) {
      alert('Emergency stop error: ' + e.message);
    }
  };

  const handleApproveAction = async (approval) => {
    setPendingApproval(null);
    handleSendMessage(`Proceed with authorized operation: ${approval.tool}`);
  };

  const handleRejectAction = async () => {
    setPendingApproval(null);
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#030712] text-slate-100 select-none">
      {/* HUD Header */}
      <Header
        isListening={isListening}
        isSpeaking={isSpeaking}
        isMicMuted={isMicMuted}
        wakeWordEnabled={wakeWordEnabled}
        wakeWordPhrase={wakeWordPhrase}
        language={language}
        onToggleLanguage={toggleLanguage}
        onOpenCommandBar={() => setIsCommandModalOpen(true)}
        onOpenOnboarding={() => setIsOnboardingModalOpen(true)}
        wsConnected={wsConnected}
        activeAgent={activeAgent}
        pendingApprovalsCount={pendingApproval ? 1 : 0}
        onToggleVoice={toggleListening}
        onToggleMicMute={toggleMicMute}
        onTriggerEmergencyStop={() => setIsEmergencyModalOpen(true)}
        onOpenVision={() => setIsVisionModalOpen(true)}
        onOpenApprovals={() => setActiveTab('missions')}
      />

      {/* Main Layout: Sidebar + Active Page */}
      <div className="flex-1 flex overflow-hidden">
        {/* Navigation Sidebar (hidden on mobile, visible on desktop) */}
        <div className="hidden md:flex">
          <Sidebar activeTab={activeTab} onSelectTab={setActiveTab} />
        </div>

        {/* Dynamic Page Stage */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-5 relative scanlines pb-20 md:pb-5">
          {activeTab === 'dashboard' && (
            <DashboardPage
              systemStatus={systemStatus}
              tasks={tasks}
              memories={memories}
              logs={logs}
              isListening={isListening}
              isSpeaking={isSpeaking}
              audioLevel={audioLevel}
              aiState={aiState}
              activeAgent={activeAgent}
              memoryActivity={memoryActivity}
              pendingApproval={pendingApproval}
              onApprovePendingAction={handleApproveAction}
              onRejectPendingAction={handleRejectAction}
              onToggleVoice={toggleListening}
              onSendMessage={handleSendMessage}
              onToggleTask={handleToggleTask}
              onNavigateTab={setActiveTab}
              permissionError={permissionError}
              transcript={transcript}
              wakeWordDetected={wakeWordDetected}
              onClearPermissionError={clearPermissionError}
            />
          )}

          {activeTab === 'missions' && <MissionControlPage />}

          {activeTab === 'sentinel' && <SentinelLivePage />}

          {activeTab === 'intelligence' && <IntelligenceHubPage />}

          {activeTab === 'chat' && (
            <ChatPage
              conversations={conversations}
              currentConversationId={currentConversationId}
              messages={messages}
              isListening={isListening}
              isSpeaking={isSpeaking}
              audioLevel={audioLevel}
              aiState={aiState}
              onSelectConversation={setCurrentConversationId}
              onCreateConversation={handleCreateConversation}
              onDeleteConversation={handleDeleteConversation}
              onSendMessage={handleSendMessage}
              onToggleVoice={toggleListening}
              onSpeakText={(text) => speak(text)}
            />
          )}

          {activeTab === 'memory' && <MemoryPage />}

          {activeTab === 'automations' && <AutomationsPage />}

          {activeTab === 'computer' && <ComputerControlPage />}

          {activeTab === 'research' && <ResearchPage />}

          {activeTab === 'devices' && <DeviceDashboardPage />}

          {activeTab === 'aegis' && <AegisTestingPage />}

          {activeTab === 'settings' && (
            <SettingsPage onSpeakTest={(text) => speak(text)} />
          )}
        </main>
      </div>

      {/* Mobile Touch Navigation Bar (Module 6: Mobile Companion) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-slate-950/95 border-t border-cyan-500/30 backdrop-blur-xl flex items-center justify-around px-2 z-30 select-none shadow-[0_-5px_20px_rgba(0,0,0,0.8)]">
        {[
          { id: 'dashboard', label: 'HUD', icon: LayoutDashboard },
          { id: 'missions', label: 'Missions', icon: Rocket },
          { id: 'chat', label: 'Chat', icon: MessageSquareCode },
          { id: 'automations', label: 'Workflows', icon: Workflow },
          { id: 'settings', label: 'Settings', icon: SlidersHorizontal }
        ].map(item => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all ${isActive ? 'text-cyan-400 font-bold scale-105' : 'text-slate-400 hover:text-slate-200'
                }`}
            >
              <Icon className="w-4 h-4 mb-1" />
              <span className="text-[10px] font-mono tracking-wider">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Emergency Kill Switch Modal */}
      <EmergencyModal
        isOpen={isEmergencyModalOpen}
        onClose={() => setIsEmergencyModalOpen(false)}
        onConfirm={handleExecuteEmergencyStop}
      />

      {/* Screen Intelligence & Computer Vision Modal */}
      <ScreenIntelligenceModal
        isOpen={isVisionModalOpen}
        onClose={() => setIsVisionModalOpen(false)}
      />

      {/* Global Command Palette (Ctrl+K) */}
      <GlobalCommandModal
        isOpen={isCommandModalOpen}
        onClose={() => setIsCommandModalOpen(false)}
        onNavigate={setActiveTab}
        language={language}
        onToggleLanguage={toggleLanguage}
        onTriggerEmergencyStop={() => {
          setIsCommandModalOpen(false);
          setIsEmergencyModalOpen(true);
        }}
      />

      {/* First-Time User Onboarding Tour */}
      <OnboardingModal
        isOpen={isOnboardingModalOpen}
        onClose={() => setIsOnboardingModalOpen(false)}
      />
    </div>
  );
}

export default App;
