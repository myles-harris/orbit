import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';

const TUTORIAL_SEEN_KEY = 'tutorial_seen_v1';

interface TutorialContextType {
  isVisible: boolean;
  isFirstRun: boolean;
  showTutorial: () => void;
  dismissTutorial: () => void;
  completeTutorial: () => void;
}

const TutorialContext = createContext<TutorialContextType | null>(null);

export function TutorialProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isFirstRun, setIsFirstRun] = useState(false);
  const prevAuthenticated = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !prevAuthenticated.current) {
      AsyncStorage.getItem(TUTORIAL_SEEN_KEY).then((val) => {
        if (val === null) {
          setIsFirstRun(true);
          setIsVisible(true);
        }
      });
    }
    prevAuthenticated.current = isAuthenticated;
  }, [isAuthenticated]);

  const showTutorial = () => {
    setIsFirstRun(false);
    setIsVisible(true);
  };

  const dismissTutorial = () => {
    setIsVisible(false);
  };

  const completeTutorial = () => {
    setIsVisible(false);
    AsyncStorage.setItem(TUTORIAL_SEEN_KEY, 'true');
  };

  return (
    <TutorialContext.Provider value={{ isVisible, isFirstRun, showTutorial, dismissTutorial, completeTutorial }}>
      {children}
    </TutorialContext.Provider>
  );
}

export function useTutorial(): TutorialContextType {
  const ctx = useContext(TutorialContext);
  if (!ctx) throw new Error('useTutorial must be used within TutorialProvider');
  return ctx;
}
