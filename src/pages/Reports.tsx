import { useState, useEffect } from 'react';
import { MeditationSession, MeditationStats } from '../services/meditationService';
import { Clock, Activity, Flame, Calendar } from 'lucide-react';
import { collection, query, where, orderBy, onSnapshot, Timestamp, limit, addDoc, getDocs } from 'firebase/firestore';
import { db } from '../services/firebase';

type TimeRange = 'week' | 'month' | 'year';

// Initial demo data
const initialDemoData: MeditationSession[] = [
  {
    id: '1',
    userId: 'demo-user',
    type: 'guided',
    duration: 15,
    completed: true,
    timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
    stressLevel: 65
  },
  {
    id: '2',
    userId: 'demo-user',
    type: 'breathing',
    duration: 10,
    completed: true,
    timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days ago
    stressLevel: 45
  },
  {
    id: '3',
    userId: 'demo-user',
    type: 'silent',
    duration: 20,
    completed: true,
    timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), // 3 days ago
    stressLevel: 55
  }
];

export default function Reports() {
  const [timeRange, setTimeRange] = useState<TimeRange>('week');
  const [stats, setStats] = useState<MeditationStats | null>(null);
  const [recentSessions, setRecentSessions] = useState<MeditationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Initialize demo data
  useEffect(() => {
    const initializeDemoData = async () => {
      try {
        const sessionsRef = collection(db, 'meditationSessions');
        const existingSessions = await getDocs(query(sessionsRef, where('userId', '==', 'demo-user')));
        
        if (existingSessions.empty) {
          // Add initial demo data if no sessions exist
          for (const session of initialDemoData) {
            await addDoc(sessionsRef, {
              ...session,
              timestamp: Timestamp.fromDate(session.timestamp)
            });
          }
        }
      } catch (err) {
        console.error('Error initializing demo data:', err);
      }
    };

    initializeDemoData();
  }, []);

  // Simulate new sessions being added periodically
  useEffect(() => {
    const simulateNewSessions = setInterval(async () => {
      try {
        const types: ('guided' | 'silent' | 'breathing')[] = ['guided', 'silent', 'breathing'];
        const randomType = types[Math.floor(Math.random() * types.length)];
        const randomDuration = Math.floor(Math.random() * 20) + 10; // 10-30 minutes

        await addDoc(collection(db, 'meditationSessions'), {
          userId: 'demo-user',
          type: randomType,
          duration: randomDuration,
          completed: true,
          timestamp: Timestamp.fromDate(new Date()),
          stressLevel: Math.floor(Math.random() * 40) + 30 // 30-70
        });
      } catch (err) {
        console.error('Error adding simulated session:', err);
      }
    }, 30000); // Add a new session every 30 seconds

    return () => clearInterval(simulateNewSessions);
  }, []);

  useEffect(() => {
    // Using a default user ID for demonstration
    const defaultUserId = 'demo-user';

    // Set up real-time listener for recent sessions
    const sessionsQuery = query(
      collection(db, 'meditationSessions'),
      where('userId', '==', defaultUserId),
      orderBy('timestamp', 'desc'),
      limit(5)
    );

    const unsubscribeSessions = onSnapshot(sessionsQuery, 
      (snapshot) => {
        const sessions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp.toDate()
        })) as MeditationSession[];
        setRecentSessions(sessions);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to sessions:', err);
        setError('Failed to load meditation data');
        setLoading(false);
      }
    );

    // Set up real-time listener for stats
    const now = new Date();
    let startDate = new Date();
    
    switch (timeRange) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
    }

    const statsQuery = query(
      collection(db, 'meditationSessions'),
      where('userId', '==', defaultUserId),
      where('timestamp', '>=', Timestamp.fromDate(startDate)),
      orderBy('timestamp', 'desc')
    );

    const unsubscribeStats = onSnapshot(statsQuery,
      (snapshot) => {
        const sessions = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp.toDate()
        })) as MeditationSession[];

        const stats: MeditationStats = {
          totalSessions: sessions.length,
          totalDuration: sessions.reduce((sum, session) => sum + session.duration, 0),
          averageDuration: sessions.length > 0 
            ? sessions.reduce((sum, session) => sum + session.duration, 0) / sessions.length 
            : 0,
          streak: calculateStreak(sessions),
          lastSessionDate: sessions.length > 0 ? sessions[0].timestamp : null,
          sessionTypes: {
            guided: sessions.filter(s => s.type === 'guided').length,
            silent: sessions.filter(s => s.type === 'silent').length,
            breathing: sessions.filter(s => s.type === 'breathing').length
          }
        };

        setStats(stats);
        setLoading(false);
      },
      (err) => {
        console.error('Error listening to stats:', err);
        setError('Failed to load meditation data');
        setLoading(false);
      }
    );

    // Cleanup listeners on unmount
    return () => {
      unsubscribeSessions();
      unsubscribeStats();
    };
  }, [timeRange]);

  const calculateStreak = (sessions: MeditationSession[]): number => {
    if (sessions.length === 0) return 0;

    let streak = 1;
    let currentDate = new Date(sessions[0].timestamp);
    currentDate.setHours(0, 0, 0, 0);

    for (let i = 1; i < sessions.length; i++) {
      const sessionDate = new Date(sessions[i].timestamp);
      sessionDate.setHours(0, 0, 0, 0);

      const diffDays = Math.floor((currentDate.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays === 1) {
        streak++;
        currentDate = sessionDate;
      } else if (diffDays > 1) {
        break; // Streak broken
      }
    }

    return streak;
  };

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  };

  const formatDate = (date: Date): string => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading your meditation journey...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error Loading Data</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Your Meditation Journey</h1>
          <p className="mt-2 text-gray-600">Track your progress and insights</p>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Statistics</h2>
            <div className="flex space-x-2">
              {(['week', 'month', 'year'] as TimeRange[]).map((range) => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-4 py-2 rounded-md text-sm font-medium ${
                    timeRange === range
                      ? 'bg-indigo-100 text-indigo-700'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {range.charAt(0).toUpperCase() + range.slice(1)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Clock className="h-6 w-6 text-indigo-600 mr-2" />
                <h3 className="text-sm font-medium text-gray-500">Total Sessions</h3>
              </div>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {stats?.totalSessions || 0}
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Activity className="h-6 w-6 text-indigo-600 mr-2" />
                <h3 className="text-sm font-medium text-gray-500">Average Duration</h3>
              </div>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {stats ? formatDuration(Math.round(stats.averageDuration)) : '0m'}
              </p>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Flame className="h-6 w-6 text-indigo-600 mr-2" />
                <h3 className="text-sm font-medium text-gray-500">Current Streak</h3>
              </div>
              <p className="mt-2 text-3xl font-semibold text-gray-900">
                {stats?.streak || 0} days
              </p>
            </div>
          </div>

          <div className="mt-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Session Types</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-indigo-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-indigo-700">Guided</h4>
                <p className="mt-2 text-2xl font-semibold text-indigo-900">
                  {stats?.sessionTypes.guided || 0}
                </p>
              </div>
              <div className="bg-purple-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-purple-700">Silent</h4>
                <p className="mt-2 text-2xl font-semibold text-purple-900">
                  {stats?.sessionTypes.silent || 0}
                </p>
              </div>
              <div className="bg-green-50 p-4 rounded-lg">
                <h4 className="text-sm font-medium text-green-700">Breathing</h4>
                <p className="mt-2 text-2xl font-semibold text-green-900">
                  {stats?.sessionTypes.breathing || 0}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Recent Sessions</h2>
          <div className="space-y-4">
            {recentSessions.length === 0 ? (
              <p className="text-center text-gray-500">No recent sessions found</p>
            ) : (
              recentSessions.map((session) => (
                <div
                  key={session.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div>
                    <h3 className="font-medium text-gray-900 capitalize">
                      {session.type} Meditation
                    </h3>
                    <div className="flex items-center text-sm text-gray-500 mt-1">
                      <Calendar className="h-4 w-4 mr-1" />
                      <span>{formatDate(session.timestamp)}</span>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600">
                    {formatDuration(session.duration)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
} 