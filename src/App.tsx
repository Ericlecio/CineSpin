import { useState, useEffect } from "react";
import {
  Search,
  Plus,
  Trash2,
  Ticket,
  LogOut,
  Star,
  CheckCircle,
  Film,
  ListVideo,
  RefreshCw,
  BarChart2,
  Sun,
  Moon,
  PlayCircle,
  X,
  Crown,
  Lock,
} from "lucide-react";
import { Wheel } from "react-custom-roulette";
import confetti from "canvas-confetti";

import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  type User,
} from "firebase/auth";
import {
  collection,
  addDoc,
  deleteDoc,
  doc,
  updateDoc,
  setDoc,
  getDoc,
  onSnapshot,
  query,
} from "firebase/firestore";
import { auth, googleProvider, db } from "./firebase";

interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  overview: string;
  vote_average: number;
}

interface SavedMovie {
  id: string;
  tmdbId: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  addedBy: string;
  addedByUid: string;
  status: "pool" | "watched";
  ratings?: {
    [userId: string]: number;
  };
  isGoldenTicket?: boolean;
  lockedByUid?: string;
  lockedByName?: string;
  isSelected?: boolean; // Novo: Grava se o filme foi sorteado
  watchedAt?: string;
}

interface Provider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

const EMAILS_PERMITIDOS = [
  "ericleciojr14@gmail.com",
  "mclara10morais@gmail.com",
];

// Algoritmo Fisher-Yates com Web Crypto API para NÍVEL CASSINO de aleatoriedade
const shuffleArray = (array: SavedMovie[]) => {
  const newArr = [...array];
  for (let i = newArr.length - 1; i > 0; i--) {
    const randomBuffer = new Uint32Array(1);
    window.crypto.getRandomValues(randomBuffer);
    const j = Math.floor((randomBuffer[0] / (0xffffffff + 1)) * (i + 1));
    [newArr[i], newArr[j]] = [newArr[j], newArr[i]];
  }
  return newArr;
};

const playTickSound = () => {
  try {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 600;
    osc.type = "sine";
    gain.gain.setValueAtTime(0.05, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
    osc.start();
    osc.stop(ctx.currentTime + 0.05);
  } catch (e) {}
};

const playWinSound = () => {
  try {
    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContext();
    const playNote = (freq: number, startTime: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "triangle";
      gain.gain.setValueAtTime(0.1, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.5);
      osc.start(startTime);
      osc.stop(startTime + 0.5);
    };
    const now = ctx.currentTime;
    playNote(440, now);
    playNote(554.37, now + 0.1);
    playNote(659.25, now + 0.2);
    playNote(880, now + 0.3);
  } catch (e) {}
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<
    "roleta" | "minha_lista" | "historico" | "estatisticas"
  >("roleta");
  const [darkMode, setDarkMode] = useState(true);

  const [searchQuery, setSearchQuery] = useState("");
  const [movies, setMovies] = useState<TMDBMovie[]>([]);

  const [poolMovies, setPoolMovies] = useState<SavedMovie[]>([]);
  const [watchedMovies, setWatchedMovies] = useState<SavedMovie[]>([]);

  // Lista embaralhada da Roleta para mudar os lugares visualmente
  const [wheelMovies, setWheelMovies] = useState<SavedMovie[]>([]);

  const [ticketBalance, setTicketBalance] = useState<number>(0);

  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);

  const [trailerKey, setTrailerKey] = useState<string | null>(null);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [showTrailerModal, setShowTrailerModal] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        if (
          currentUser.email &&
          EMAILS_PERMITIDOS.includes(currentUser.email)
        ) {
          setUser(currentUser);
        } else {
          alert(
            `Acesso Negado! O e-mail ${currentUser.email} não está autorizado.`,
          );
          await signOut(auth);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const checkAndGrantTickets = async () => {
      const ticketRef = doc(db, "golden_tickets", user.uid);
      const ticketSnap = await getDoc(ticketRef);
      const currentMonth = new Date().toISOString().slice(0, 7);

      if (ticketSnap.exists()) {
        const data = ticketSnap.data();
        const lastClaimed = data.lastClaimedMonth || currentMonth;
        let balance = data.ticketBalance || 0;

        if (lastClaimed < currentMonth) {
          const [y1, m1] = lastClaimed.split("-").map(Number);
          const [y2, m2] = currentMonth.split("-").map(Number);
          const monthsPassed = (y2 - y1) * 12 + (m2 - m1);

          if (monthsPassed > 0) {
            balance += monthsPassed;
            await updateDoc(ticketRef, {
              ticketBalance: balance,
              lastClaimedMonth: currentMonth,
            });
          }
        }
      } else {
        await setDoc(ticketRef, {
          ticketBalance: 1,
          lastClaimedMonth: currentMonth,
        });
      }
    };
    checkAndGrantTickets();

    const unsubscribeTickets = onSnapshot(
      doc(db, "golden_tickets", user.uid),
      (docSnap) => {
        if (docSnap.exists())
          setTicketBalance(docSnap.data().ticketBalance || 0);
      },
    );
    return () => unsubscribeTickets();
  }, [user]);

  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (searchQuery.trim().length > 2) {
        const apiKey = import.meta.env.VITE_TMDB_API_KEY;
        try {
          const res = await fetch(
            `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&language=pt-BR&query=${encodeURIComponent(searchQuery)}`,
          );
          const data = await res.json();
          const sortedMovies = (data.results || []).sort(
            (a: TMDBMovie, b: TMDBMovie) => {
              const dateA = a.release_date
                ? new Date(a.release_date).getTime()
                : 0;
              const dateB = b.release_date
                ? new Date(b.release_date).getTime()
                : 0;
              return dateA - dateB;
            },
          );
          setMovies(sortedMovies);
        } catch (error) {
          console.error("Erro ao buscar filmes:", error);
        }
      } else if (searchQuery.trim().length === 0) {
        setMovies([]);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, "movies"));
    const unsubscribeMovies = onSnapshot(q, (snapshot) => {
      const allDocs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      const allMovies = allDocs as SavedMovie[];
      setPoolMovies(allMovies.filter((m) => m.status === "pool"));
      setWatchedMovies(allMovies.filter((m) => m.status === "watched"));
    });
    return () => unsubscribeMovies();
  }, [user]);

  // Embaralha visualmente a roda sempre que a lista mudar e NÃO estiver a girar
  useEffect(() => {
    if (!mustSpin && poolMovies.length > 0) {
      setWheelMovies(shuffleArray(poolMovies));
    }
  }, [poolMovies, mustSpin]);

  // Verifica persistência no Banco de Dados (Mesmo após dar F5, o vencedor ou bloqueio ficam salvos)
  const lockedMovie = poolMovies.find((m) => m.isGoldenTicket);
  const dbWinner = poolMovies.find((m) => m.isSelected);

  // Se estiver a girar (mustSpin === true), esconde o vencedor para mostrar a roleta girando
  const activeMovieDisplay =
    lockedMovie || (dbWinner && !mustSpin ? dbWinner : null);
  const activeTmdbId = activeMovieDisplay?.tmdbId;

  useEffect(() => {
    if (activeTmdbId) {
      const fetchExtraDetails = async () => {
        const apiKey = import.meta.env.VITE_TMDB_API_KEY;
        const res = await fetch(
          `https://api.themoviedb.org/3/movie/${activeTmdbId}?api_key=${apiKey}&language=pt-BR&append_to_response=videos,watch/providers`,
        );
        const data = await res.json();
        const videos = data.videos?.results || [];
        const trailer =
          videos.find(
            (v: any) => v.type === "Trailer" && v.site === "YouTube",
          ) || videos.find((v: any) => v.site === "YouTube");
        setTrailerKey(trailer ? trailer.key : null);
        const brProviders =
          data["watch/providers"]?.results?.BR?.flatrate || [];
        setProviders(brProviders);
      };
      fetchExtraDetails();
    } else {
      setTrailerKey(null);
      setProviders([]);
    }
  }, [activeTmdbId]);

  useEffect(() => {
    if (lockedMovie) {
      setMustSpin(false);
    }
  }, [lockedMovie]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (mustSpin && !lockedMovie) {
      interval = setInterval(() => playTickSound(), 150);
    }
    return () => clearInterval(interval);
  }, [mustSpin, lockedMovie]);

  const isEriclecio = user?.email === "ericleciojr14@gmail.com";
  const myColorClass = isEriclecio ? "text-blue-500" : "text-pink-500";
  const partnerColorClass = isEriclecio ? "text-pink-500" : "text-blue-500";
  const partnerTitle = isEriclecio ? "Lista Dela" : "Lista Dele";
  const partnerPronoun = isEriclecio ? "Ela" : "Ele";
  const partnerPronounUpper = isEriclecio ? "DELA" : "DELE";

  const myPoolMovies = poolMovies.filter((m) => m.addedByUid === user?.uid);
  const partnerPoolMovies = poolMovies.filter(
    (m) => m.addedByUid !== user?.uid,
  );

  const sortedWatched = [...watchedMovies].sort((a, b) => {
    const dateA = a.watchedAt ? new Date(a.watchedAt).getTime() : 0;
    const dateB = b.watchedAt ? new Date(b.watchedAt).getTime() : 0;
    return dateB - dateA;
  });
  const lastWatchedMovie = sortedWatched[0];

  const handleGoldenTicket = async (movie: SavedMovie) => {
    if (!user || !user.uid || ticketBalance <= 0 || lockedMovie) return;

    // Se já havia um vencedor sorteado antes do bloqueio, remove ele
    if (dbWinner) {
      await updateDoc(doc(db, "movies", dbWinner.id), { isSelected: false });
    }

    await updateDoc(doc(db, "golden_tickets", user.uid), {
      ticketBalance: ticketBalance - 1,
    });
    await updateDoc(doc(db, "movies", movie.id), {
      isGoldenTicket: true,
      lockedByUid: user.uid,
      lockedByName: user.displayName?.split(" ")[0] || "Alguém",
    });

    playWinSound();
    confetti({
      particleCount: 200,
      spread: 120,
      origin: { y: 0.5 },
      colors: ["#FFD700", "#FFA500", "#FFF8DC", "#F59E0B"],
    });
    setActiveTab("roleta");
  };

  const handleLogin = async () => signInWithPopup(auth, googleProvider);
  const handleLogout = () => signOut(auth);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
  };

  const addToMyList = async (movie: TMDBMovie) => {
    if (poolMovies.some((m) => m.tmdbId === movie.id)) return;
    await addDoc(collection(db, "movies"), {
      tmdbId: movie.id,
      title: movie.title,
      poster_path: movie.poster_path,
      release_date: movie.release_date,
      addedBy: user?.displayName?.split(" ")[0] || "Alguém",
      addedByUid: user?.uid,
      status: "pool",
    });
    setSearchQuery("");
    setMovies([]);
  };

  const addDirectlyToWatched = async (movie: TMDBMovie) => {
    if (watchedMovies.some((m) => m.tmdbId === movie.id)) return;
    await addDoc(collection(db, "movies"), {
      tmdbId: movie.id,
      title: movie.title,
      poster_path: movie.poster_path,
      release_date: movie.release_date,
      addedBy: user?.displayName?.split(" ")[0] || "Alguém",
      addedByUid: user?.uid,
      status: "watched",
      watchedAt: new Date().toISOString(),
    });
    setSearchQuery("");
    setMovies([]);
    setActiveTab("historico");
  };

  const removeFromDb = async (id: string) =>
    await deleteDoc(doc(db, "movies", id));

  const markAsWatched = async (movie: SavedMovie) => {
    await updateDoc(doc(db, "movies", movie.id), {
      status: "watched",
      isGoldenTicket: false,
      isSelected: false,
      watchedAt: new Date().toISOString(),
    });
    setActiveTab("historico");
  };

  const rateMovie = async (movieId: string, rating: number) => {
    if (!user) return;
    const movie = watchedMovies.find((m) => m.id === movieId);
    const currentRating = movie?.ratings?.[user.uid] || 0;
    await updateDoc(doc(db, "movies", movieId), {
      [`ratings.${user.uid}`]: currentRating === rating ? 0 : rating,
    });
  };

  const handleSpinClick = async () => {
    if (!mustSpin && wheelMovies.length > 0 && !lockedMovie) {
      // Aleatoriedade Criptográfica (Mais preciso que Math.random)
      const randomBuffer = new Uint32Array(1);
      window.crypto.getRandomValues(randomBuffer);
      const randomFraction = randomBuffer[0] / (0xffffffff + 1);
      const randomPrize = Math.floor(randomFraction * wheelMovies.length);

      setPrizeNumber(randomPrize);
      setMustSpin(true);
    }
  };

  const onStopSpinning = async () => {
    setMustSpin(false);
    const winnerMovie = wheelMovies[prizeNumber];
    if (winnerMovie && !lockedMovie) {
      // Salva o vencedor no banco de dados. Torna persistente após F5!
      await updateDoc(doc(db, "movies", winnerMovie.id), { isSelected: true });

      playWinSound();
      confetti({
        particleCount: 150,
        spread: 80,
        origin: { y: 0.6 },
        colors: ["#2563eb", "#db2777", "#fbbf24", "#ffffff"],
      });
    }
  };

  const handleSpinAgain = async () => {
    // Ao clicar em girar novamente, remove a flag do DB e volta pra tela da roleta!
    if (dbWinner) {
      await updateDoc(doc(db, "movies", dbWinner.id), { isSelected: false });
    }
  };

  const rouletteData = wheelMovies.map((m) => ({
    option: m.title.length > 15 ? `${m.title.substring(0, 15)}...` : m.title,
  }));

  if (loadingAuth)
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-blue-500 font-bold text-xl">
        A Carregar CineSpin...
      </div>
    );

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-black text-gray-100">
        <div className="bg-zinc-900 p-8 rounded-3xl shadow-2xl border border-zinc-800 flex flex-col items-center max-w-sm w-full">
          <Ticket className="w-20 h-20 text-blue-500 mb-6 animate-pulse" />
          <h1 className="text-5xl font-extrabold text-blue-500 mb-2">
            CineSpin
          </h1>
          <p className="text-gray-400 text-lg mb-10">Exclusivo do Casal</p>
          <button
            onClick={handleLogin}
            className="w-full bg-white text-gray-900 font-bold py-4 rounded-xl flex items-center justify-center gap-3 hover:bg-gray-100 transition-transform active:scale-95 shadow-lg"
          >
            <img
              src="https://www.svgrepo.com/show/475656/google-color.svg"
              alt="Google"
              className="w-6 h-6"
            />{" "}
            Entrar com Google
          </button>
        </div>
      </div>
    );
  }

  const myWatchedCount = watchedMovies.filter(
    (m) => m.addedByUid === user.uid,
  ).length;
  const partnerWatchedCount = watchedMovies.length - myWatchedCount;
  let myScore = 0,
    myVotes = 0,
    partnerScore = 0,
    partnerVotes = 0;

  watchedMovies.forEach((m) => {
    if (m.ratings) {
      Object.values(m.ratings).forEach((n) => {
        if (n > 0) {
          if (m.addedByUid === user.uid) {
            myScore += n;
            myVotes++;
          } else {
            partnerScore += n;
            partnerVotes++;
          }
        }
      });
    }
  });

  const myAvg = myVotes > 0 ? (myScore / myVotes).toFixed(1) : "0.0";
  const partnerAvg =
    partnerVotes > 0 ? (partnerScore / partnerVotes).toFixed(1) : "0.0";

  const bgMain = darkMode
    ? "bg-black text-gray-100"
    : "bg-gray-50 text-gray-900";
  const bgCard = darkMode
    ? "bg-zinc-900/90 backdrop-blur-md border-zinc-800 shadow-2xl shadow-blue-950/20"
    : "bg-white border-gray-200 shadow-xl";
  const bgInput = darkMode
    ? "bg-black border-zinc-700 text-white"
    : "bg-gray-100 border-gray-300 text-gray-900";
  const tabActive =
    "bg-blue-600 text-white shadow-lg shadow-blue-600/30 scale-105";
  const tabInactive = darkMode
    ? "text-gray-400 hover:text-white hover:bg-zinc-800/50"
    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100";

  return (
    <div
      className={`min-h-screen ${bgMain} flex flex-col justify-between transition-colors duration-300 relative`}
    >
      {showTrailerModal && trailerKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/95 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-4xl bg-black rounded-2xl overflow-hidden relative shadow-2xl shadow-blue-900/20 border border-zinc-800">
            <button
              onClick={() => setShowTrailerModal(false)}
              className="absolute top-4 right-4 z-10 text-white bg-black/60 hover:bg-red-600 p-2 rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
            <div className="aspect-video w-full">
              <iframe
                src={`https://www.youtube.com/embed/${trailerKey}?autoplay=1`}
                className="w-full h-full"
                allowFullScreen
                allow="autoplay; encrypted-media"
                title="Trailer"
              ></iframe>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-6xl w-full mx-auto p-3 sm:p-6 flex-1">
        <header
          className={`flex justify-between items-center mb-6 p-3 sm:p-4 rounded-2xl border transition-all ${bgCard}`}
        >
          <h1 className="text-xl sm:text-3xl font-extrabold text-blue-500 tracking-tight flex items-center gap-2 drop-shadow-md">
            <Ticket className="w-6 h-6 sm:w-8 sm:h-8 text-blue-500 animate-bounce" />{" "}
            CineSpin
          </h1>
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setDarkMode(!darkMode)}
              className={`p-2.5 rounded-xl border transition-all hover:scale-110 active:scale-95 ${darkMode ? "bg-zinc-800 border-zinc-700 text-yellow-400 shadow-inner" : "bg-gray-100 border-gray-300 text-amber-600"}`}
            >
              {darkMode ? (
                <Sun className="w-5 h-5 animate-spin-slow" />
              ) : (
                <Moon className="w-5 h-5" />
              )}
            </button>
            <div className="text-right hidden sm:block">
              <p className="font-bold text-sm">
                {user.displayName?.split(" ")[0]}
              </p>
            </div>
            <img
              src={user.photoURL || ""}
              alt="Perfil"
              referrerPolicy="no-referrer"
              className="w-9 h-9 sm:w-10 sm:h-10 rounded-full border-2 border-blue-500 shadow-md object-cover"
            />
            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-red-500 bg-gray-500/10 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </header>

        <div
          className={`flex p-1.5 rounded-xl mb-8 shadow-inner overflow-x-auto no-scrollbar gap-1 border ${bgCard}`}
        >
          <button
            onClick={() => setActiveTab("roleta")}
            className={`flex-1 flex justify-center items-center gap-1.5 px-3 py-2.5 rounded-lg font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${activeTab === "roleta" ? tabActive : tabInactive}`}
          >
            <Ticket className="w-4 h-4" /> Sorteio
          </button>
          <button
            onClick={() => setActiveTab("minha_lista")}
            className={`flex-1 flex justify-center items-center gap-1.5 px-3 py-2.5 rounded-lg font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${activeTab === "minha_lista" ? tabActive : tabInactive}`}
          >
            <ListVideo className="w-4 h-4" /> Lista
          </button>
          <button
            onClick={() => setActiveTab("historico")}
            className={`flex-1 flex justify-center items-center gap-2 px-3 py-2.5 rounded-lg font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${activeTab === "historico" ? tabActive : tabInactive}`}
          >
            <Film className="w-4 h-4" /> Histórico
          </button>
          <button
            onClick={() => setActiveTab("estatisticas")}
            className={`flex-1 flex justify-center items-center gap-2 px-3 py-2.5 rounded-lg font-bold text-xs sm:text-sm transition-all whitespace-nowrap ${activeTab === "estatisticas" ? tabActive : tabInactive}`}
          >
            <BarChart2 className="w-4 h-4" /> Status
          </button>
        </div>

        {activeTab === "roleta" && (
          <div>
            {activeMovieDisplay ? (
              <div
                className={`rounded-3xl p-6 md:p-10 flex flex-col items-center shadow-2xl border-2 animate-in fade-in zoom-in duration-500 ${lockedMovie ? "border-yellow-500 bg-yellow-500/5" : "border-blue-500/50 " + bgCard}`}
              >
                {lockedMovie ? (
                  <div className="mb-6 bg-gradient-to-r from-yellow-400 to-yellow-600 text-black px-6 py-2 rounded-full font-extrabold text-sm sm:text-base flex items-center gap-2 shadow-lg shadow-yellow-500/30">
                    <Crown className="w-5 h-5" /> Roleta Bloqueada: Escolha de{" "}
                    {lockedMovie.lockedByName}!
                  </div>
                ) : (
                  <p className="text-sm uppercase tracking-widest mb-2 font-bold text-blue-400">
                    Filme Sorteado
                  </p>
                )}

                {activeMovieDisplay.poster_path && (
                  <img
                    src={`https://image.tmdb.org/t/p/w300${activeMovieDisplay.poster_path}`}
                    className="w-48 rounded-xl shadow-2xl mb-4 border border-zinc-700 hover:scale-105 transition-transform"
                    alt="Poster"
                  />
                )}

                {providers.length > 0 ? (
                  <div className="flex flex-col items-center gap-2 mb-4 animate-in fade-in duration-700 delay-300">
                    <span className="text-xs font-medium uppercase tracking-wider opacity-60">
                      Disponível em:
                    </span>
                    <div className="flex flex-wrap justify-center gap-2">
                      {providers.map((p) => (
                        <img
                          key={p.provider_id}
                          src={`https://image.tmdb.org/t/p/w92${p.logo_path}`}
                          title={p.provider_name}
                          className="w-8 h-8 rounded-lg shadow-md border border-zinc-700 hover:scale-110 transition-transform"
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="mb-4 text-xs opacity-40 italic">
                    Não achamos em streamings grátis :(
                  </div>
                )}

                <h3
                  className={`text-2xl md:text-4xl font-extrabold mb-2 text-center drop-shadow ${lockedMovie ? "text-yellow-500" : "text-blue-400"}`}
                >
                  {activeMovieDisplay.title}
                </h3>
                <p className="opacity-70 mb-4">
                  Da lista de:{" "}
                  <span className="font-bold">
                    {activeMovieDisplay.addedBy}
                  </span>
                </p>

                {trailerKey && (
                  <button
                    onClick={() => setShowTrailerModal(true)}
                    className="flex items-center gap-2 text-red-500 hover:text-red-400 font-bold mb-8 border border-red-500/30 hover:border-red-500 px-4 py-2 rounded-full transition-all"
                  >
                    <PlayCircle className="w-5 h-5" /> Assistir Trailer
                  </button>
                )}

                <div className="flex flex-col w-full max-w-md gap-3">
                  {lockedMovie ? (
                    user.uid === lockedMovie.lockedByUid ? (
                      <button
                        onClick={() => markAsWatched(lockedMovie)}
                        className="w-full bg-gradient-to-r from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white px-4 py-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-transform active:scale-95 shadow-lg shadow-emerald-900/30"
                      >
                        <CheckCircle className="w-6 h-6" /> Confirmar Sessão
                        (Desbloquear Roleta)
                      </button>
                    ) : (
                      <button
                        disabled
                        className="w-full bg-zinc-800/80 text-zinc-400 px-4 py-4 rounded-xl font-bold flex justify-center items-center gap-2 border border-zinc-700 cursor-not-allowed"
                      >
                        <Lock className="w-5 h-5" /> A aguardar que{" "}
                        {lockedMovie.lockedByName} desbloqueie...
                      </button>
                    )
                  ) : (
                    <div className="flex flex-col sm:flex-row w-full gap-3">
                      <button
                        onClick={() => markAsWatched(activeMovieDisplay)}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-transform active:scale-95 shadow-lg shadow-emerald-900/30"
                      >
                        <CheckCircle className="w-5 h-5" /> Já Assistimos!
                      </button>
                      <button
                        onClick={handleSpinAgain}
                        className="flex-1 bg-zinc-800 hover:bg-zinc-700 px-4 py-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-transform active:scale-95 border border-zinc-700 shadow-lg"
                      >
                        <RefreshCw className="w-5 h-5" /> Girar Novamente
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ) : wheelMovies.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                <div
                  className={`order-2 md:order-1 w-full p-4 rounded-2xl border ${bgCard} shadow-lg flex flex-col`}
                >
                  <h3
                    className={`font-bold text-xs sm:text-sm ${partnerColorClass} mb-3 uppercase tracking-wider flex items-center gap-1.5`}
                  >
                    <Film className="w-4 h-4" /> {partnerTitle} (
                    {partnerPoolMovies.length})
                  </h3>
                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[350px] pr-1">
                    {partnerPoolMovies.map((m) => (
                      <div
                        key={m.id}
                        className="text-xs p-2.5 rounded-xl bg-zinc-500/10 flex items-center justify-between border border-zinc-500/5"
                      >
                        <span className="truncate">{m.title}</span>
                      </div>
                    ))}
                    {partnerPoolMovies.length === 0 && (
                      <span className="text-xs opacity-40 italic">
                        Nenhum filme
                      </span>
                    )}
                  </div>
                </div>

                <div
                  className={`order-1 md:order-2 md:col-span-2 w-full rounded-3xl p-6 sm:p-8 flex flex-col items-center shadow-2xl border ${bgCard} text-center relative overflow-hidden`}
                >
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>
                  <h2 className="text-lg sm:text-xl font-bold mb-6 tracking-wide text-blue-400">
                    Roleta do Casal
                  </h2>
                  <div className="w-full flex justify-center items-center my-4 pointer-events-none drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)]">
                    <div className="w-full max-w-[320px] aspect-square flex justify-center items-center">
                      <Wheel
                        mustStartSpinning={mustSpin}
                        prizeNumber={prizeNumber}
                        data={rouletteData}
                        backgroundColors={[
                          "#2563eb",
                          "#db2777",
                          "#9333ea",
                          "#16a34a",
                          "#ca8a04",
                          "#dc2626",
                        ]}
                        textColors={["#ffffff"]}
                        spinDuration={0.8}
                        outerBorderColor="#27272a"
                        outerBorderWidth={8}
                        innerBorderColor="#27272a"
                        innerBorderWidth={4}
                        innerRadius={18}
                        radiusLineColor="#3f3f46"
                        radiusLineWidth={2}
                        onStopSpinning={onStopSpinning}
                      />
                    </div>
                  </div>
                  <button
                    onClick={handleSpinClick}
                    disabled={mustSpin}
                    className="w-full max-w-xs mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-xl shadow-blue-600/30 active:scale-95 transition-all"
                  >
                    {mustSpin ? "A girar a roleta..." : "Girar Roleta!"}
                  </button>

                  {lastWatchedMovie && (
                    <div className="mt-8 w-full bg-zinc-800/40 border border-zinc-700/60 rounded-2xl p-3 flex items-center gap-4 shadow-inner">
                      {lastWatchedMovie.poster_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w92${lastWatchedMovie.poster_path}`}
                          className="w-10 h-14 rounded-lg object-cover shadow-sm"
                        />
                      ) : (
                        <div className="w-10 h-14 bg-zinc-700/50 rounded-lg"></div>
                      )}
                      <div className="flex-1 text-left">
                        <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider flex items-center gap-1 mb-0.5">
                          <CheckCircle className="w-3 h-3" /> Último Assistido
                        </p>
                        <p className="font-bold text-sm leading-tight text-gray-200 line-clamp-1">
                          {lastWatchedMovie.title}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div
                  className={`order-3 md:order-3 w-full p-4 rounded-2xl border ${bgCard} shadow-lg flex flex-col`}
                >
                  <h3
                    className={`font-bold text-xs sm:text-sm ${myColorClass} mb-3 uppercase tracking-wider flex items-center gap-1.5`}
                  >
                    <Film className="w-4 h-4" /> Sua Lista (
                    {myPoolMovies.length})
                  </h3>
                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[350px] pr-1">
                    {myPoolMovies.map((m) => (
                      <div
                        key={m.id}
                        className="text-xs p-2.5 rounded-xl bg-zinc-500/10 flex items-center justify-between border border-zinc-500/5"
                      >
                        <span className="truncate">{m.title}</span>
                      </div>
                    ))}
                    {myPoolMovies.length === 0 && (
                      <span className="text-xs opacity-40 italic">
                        Nenhum filme
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`text-center py-20 rounded-3xl border ${bgCard} opacity-70 shadow-xl`}
              >
                <Ticket className="w-16 h-16 mx-auto mb-4 opacity-20 animate-bounce" />
                <p className="text-lg">A roleta está vazia.</p>
                <p className="text-sm mt-2">
                  Vá à aba "Lista" e adicione filmes!
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "minha_lista" && (
          <div>
            <div
              className={`p-4 md:p-6 rounded-2xl border mb-6 shadow-xl ${bgCard}`}
            >
              <h2 className="font-bold text-lg mb-4 text-blue-400">
                Adicionar Filme / Série
              </h2>

              <form
                onSubmit={handleSearchSubmit}
                className="flex flex-col sm:flex-row gap-3"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquise o título e aguarde..."
                    className={`w-full border rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-blue-500 text-base shadow-inner ${bgInput}`}
                  />
                </div>
              </form>

              {movies.length > 0 && (
                <div className="flex flex-col gap-4 mt-6">
                  {movies.map((movie) => (
                    <div
                      key={movie.id}
                      className={`rounded-xl flex flex-col sm:flex-row overflow-hidden shadow-lg border ${bgCard}`}
                    >
                      {movie.poster_path ? (
                        <img
                          src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`}
                          className="w-full sm:w-28 h-48 sm:h-auto object-cover"
                        />
                      ) : (
                        <div className="w-full sm:w-28 h-32 bg-zinc-800 flex items-center justify-center text-xs opacity-50">
                          Sem capa
                        </div>
                      )}
                      <div className="p-4 flex flex-col flex-1">
                        <div className="flex justify-between items-start mb-1 gap-2">
                          <h3 className="font-bold text-base md:text-lg leading-tight">
                            {movie.title}
                          </h3>
                          <div className="flex items-center gap-1 bg-yellow-500/10 text-yellow-500 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap">
                            <Star className="w-3.5 h-3.5 fill-yellow-500" />
                            {movie.vote_average
                              ? movie.vote_average.toFixed(1)
                              : "N/A"}
                          </div>
                        </div>
                        <p className="text-xs opacity-60 mb-2">
                          {movie.release_date
                            ? movie.release_date.split("-")[0]
                            : "Ano desconhecido"}
                        </p>
                        <p className="text-xs md:text-sm opacity-80 line-clamp-2 mb-4">
                          {movie.overview || "Sinopse não disponível."}
                        </p>
                        <div className="flex flex-col sm:flex-row gap-2.5 mt-auto">
                          <button
                            onClick={() => addToMyList(movie)}
                            className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex justify-center items-center gap-1.5 active:scale-95 shadow-md"
                          >
                            <Plus className="w-4 h-4" /> Adicionar à Roleta
                          </button>
                          <button
                            onClick={() => addDirectlyToWatched(movie)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex justify-center items-center gap-1.5 active:scale-95 shadow-md"
                          >
                            <CheckCircle className="w-4 h-4" /> Já Assistido
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold">
                Seus Filmes na Roleta ({myPoolMovies.length})
              </h2>
              <span
                className={`text-xs font-bold px-3 py-1.5 rounded-full ${ticketBalance > 0 ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/30" : "bg-zinc-800 text-zinc-500"}`}
              >
                🎟️ Ingressos Dourados: {ticketBalance}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {myPoolMovies.map((movie) => (
                <div
                  key={movie.id}
                  className={`p-3 rounded-2xl flex items-center justify-between border shadow-md ${bgCard}`}
                >
                  <div className="flex items-center gap-3 overflow-hidden">
                    {movie.poster_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w92${movie.poster_path}`}
                        className="w-10 h-14 rounded-lg object-cover shadow"
                      />
                    ) : (
                      <div className="w-10 h-14 bg-zinc-800 rounded-lg flex-shrink-0"></div>
                    )}
                    <h3 className="font-bold text-sm truncate">
                      {movie.title}
                    </h3>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleGoldenTicket(movie)}
                      disabled={ticketBalance <= 0 || !!lockedMovie}
                      title={
                        lockedMovie
                          ? `Bloqueado! ${lockedMovie.lockedByName} já usou o ingresso.`
                          : ticketBalance > 0
                            ? "Gastar Ingresso Dourado!"
                            : "Você não tem saldo!"
                      }
                      className={`p-2.5 rounded-xl transition-all flex items-center justify-center ${ticketBalance > 0 && !lockedMovie ? "bg-gradient-to-r from-yellow-400 to-yellow-600 text-white hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(250,204,21,0.5)] cursor-pointer" : "bg-zinc-800/50 text-zinc-600 cursor-not-allowed"}`}
                    >
                      <Crown className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => removeFromDb(movie.id)}
                      className="p-2.5 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "historico" && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold mb-6 text-blue-500">
              Já Assistidos ({watchedMovies.length})
            </h2>
            <div className="grid grid-cols-1 gap-4">
              {watchedMovies.map((movie) => {
                const myRating = movie.ratings?.[user.uid] || 0;
                return (
                  <div
                    key={movie.id}
                    className={`rounded-2xl flex flex-col sm:flex-row overflow-hidden shadow-xl border ${bgCard}`}
                  >
                    {movie.poster_path ? (
                      <img
                        src={`https://image.tmdb.org/t/p/w200${movie.poster_path}`}
                        className="w-full sm:w-28 h-40 sm:h-auto object-cover"
                      />
                    ) : (
                      <div className="w-full sm:w-28 h-32 bg-zinc-800 flex items-center justify-center text-xs opacity-50">
                        Sem capa
                      </div>
                    )}
                    <div className="p-4 flex flex-col flex-1">
                      <div className="flex justify-between items-start mb-1">
                        <h3 className="font-bold text-base md:text-xl line-clamp-2">
                          {movie.title}
                        </h3>
                        <button
                          onClick={() => removeFromDb(movie.id)}
                          className="text-red-500 p-1"
                        >
                          <Trash2 className="w-4 h-4 md:w-5 md:h-5" />
                        </button>
                      </div>
                      <p className="text-xs opacity-60 mb-3">
                        Registado por:{" "}
                        <span className="font-bold">{movie.addedBy}</span>
                      </p>

                      <div
                        className={`mt-auto p-3 rounded-xl border inline-block shadow-inner ${darkMode ? "bg-black border-zinc-800" : "bg-gray-50 border-gray-200"}`}
                      >
                        <p className="text-xs opacity-70 mb-1.5 font-medium uppercase tracking-wider flex items-center justify-between">
                          Sua Nota{" "}
                          {myRating === 0 && (
                            <span className="opacity-40 lowercase">
                              (0 estrelas)
                            </span>
                          )}
                        </p>
                        <div className="flex gap-1.5">
                          {[1, 2, 3, 4, 5].map((star) => (
                            <button
                              key={star}
                              onClick={() => rateMovie(movie.id, star)}
                              className="focus:outline-none transition-transform hover:scale-125 active:scale-90"
                            >
                              <Star
                                className={`w-6 h-6 sm:w-7 sm:h-7 ${star <= myRating ? "fill-yellow-500 text-yellow-500 drop-shadow-[0_0_8px_rgba(234,179,8,0.6)]" : "opacity-20"}`}
                              />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {activeTab === "estatisticas" && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold mb-6 text-blue-500">
              Placar do Bom Gosto 📊
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                className={`p-6 rounded-3xl border shadow-xl flex flex-col items-center text-center ${bgCard}`}
              >
                <Film className={`w-8 h-8 ${myColorClass} mb-3`} />
                <h3 className="text-sm sm:text-base opacity-70 font-medium mb-1">
                  Filmes que Você Indicou
                </h3>
                <p className="text-4xl font-extrabold">{myWatchedCount}</p>
                <p className="text-xs opacity-50 mt-1">assistidos até hoje</p>
              </div>
              <div
                className={`p-6 rounded-3xl border shadow-xl flex flex-col items-center text-center ${bgCard}`}
              >
                <Film className={`w-8 h-8 ${partnerColorClass} mb-3`} />
                <h3 className="text-sm sm:text-base opacity-70 font-medium mb-1">
                  Filmes que {partnerPronoun} Indicou
                </h3>
                <p className="text-4xl font-extrabold">{partnerWatchedCount}</p>
                <p className="text-xs opacity-50 mt-1">assistidos até hoje</p>
              </div>
              <div
                className={`p-6 rounded-3xl border shadow-xl flex flex-col items-center text-center ${bgCard}`}
              >
                <Star className="w-8 h-8 text-yellow-500 mb-3" />
                <h3 className="text-sm sm:text-base opacity-70 font-medium mb-1">
                  Nota Média da SUA Lista
                </h3>
                <p className="text-4xl font-extrabold">{myAvg}</p>
                <p className="text-xs opacity-50 mt-1">
                  Média de estrelas dos seus filmes
                </p>
              </div>
              <div
                className={`p-6 rounded-3xl border shadow-xl flex flex-col items-center text-center ${bgCard}`}
              >
                <Star className="w-8 h-8 text-yellow-500 mb-3" />
                <h3 className="text-sm sm:text-base opacity-70 font-medium mb-1">
                  Nota Média da Lista {partnerPronounUpper}
                </h3>
                <p className="text-4xl font-extrabold">{partnerAvg}</p>
                <p className="text-xs opacity-50 mt-1">
                  Média de estrelas dos filmes{" "}
                  {partnerPronounUpper.toLowerCase()}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="mt-12 py-5 border-t bg-blue-950 border-blue-900 text-blue-200 text-center transition-colors shadow-inner">
        <div className="max-w-4xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p className="text-xs sm:text-sm font-medium">
            Desenvolvido por Ericlecio
          </p>
          <div className="flex items-center gap-6">
            <a
              href="https://www.linkedin.com/in/ericlecio-thiago/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-white transition-colors text-xs sm:text-sm font-medium"
            >
              <svg
                className="w-4 h-4 text-blue-400 fill-current"
                viewBox="0 0 24 24"
              >
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z" />
              </svg>{" "}
              LinkedIn
            </a>
            <a
              href="https://github.com/Ericlecio"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:text-white transition-colors text-xs sm:text-sm font-medium"
            >
              <svg
                className="w-4 h-4 text-blue-200 fill-current"
                viewBox="0 0 24 24"
              >
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
              </svg>{" "}
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
