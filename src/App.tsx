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
} from "lucide-react";
import { Wheel } from "react-custom-roulette";

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
}

const EMAILS_PERMITIDOS = [
  "ericleciojr14@gmail.com",
  "mclara10morais@gmail.com",
];

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

  const [mustSpin, setMustSpin] = useState(false);
  const [prizeNumber, setPrizeNumber] = useState(0);
  const [winner, setWinner] = useState<SavedMovie | null>(null);

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
    const q = query(collection(db, "movies"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allMovies = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as SavedMovie[];
      setPoolMovies(allMovies.filter((m) => m.status === "pool"));
      setWatchedMovies(allMovies.filter((m) => m.status === "watched"));
    });
    return () => unsubscribe();
  }, [user]);

  const myMovies = poolMovies.filter((m) => m.addedByUid === user?.uid);
  const herEmail = "mclara10morais@gmail.com";
  const herMovies = poolMovies.filter(
    (m) => m.addedByUid !== user?.uid || user?.email === herEmail,
  );
  const myPoolMovies = poolMovies.filter((m) => m.addedByUid === user?.uid);

  const handleLogin = async () => signInWithPopup(auth, googleProvider);
  const handleLogout = () => signOut(auth);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const apiKey = import.meta.env.VITE_TMDB_API_KEY;
    const res = await fetch(
      `https://api.themoviedb.org/3/search/movie?api_key=${apiKey}&language=pt-BR&query=${encodeURIComponent(searchQuery)}`,
    );
    const data = await res.json();
    setMovies(data.results || []);
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
    });
    setSearchQuery("");
    setMovies([]);
    setActiveTab("historico");
  };

  const removeFromDb = async (id: string) =>
    await deleteDoc(doc(db, "movies", id));

  const markAsWatched = async (movie: SavedMovie) => {
    await updateDoc(doc(db, "movies", movie.id), { status: "watched" });
    setWinner(null);
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

  const handleSpinClick = () => {
    if (!mustSpin && poolMovies.length > 0) {
      setWinner(null);
      setPrizeNumber(Math.floor(Math.random() * poolMovies.length));
      setMustSpin(true);
    }
  };

  const onStopSpinning = () => {
    setMustSpin(false);
    const winnerMovie = poolMovies[prizeNumber];
    if (winnerMovie) setWinner(winnerMovie);
  };

  const rouletteData = poolMovies.map((m) => ({
    option: m.title.length > 15 ? `${m.title.substring(0, 15)}...` : m.title,
  }));

  if (loadingAuth)
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-blue-500 font-bold text-xl">
        Carregando CineSpin...
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
      className={`min-h-screen ${bgMain} flex flex-col justify-between transition-colors duration-300`}
    >
      <div className="max-w-6xl w-full mx-auto p-3 sm:p-6 flex-1">
        {/* CABEÇALHO */}
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
              title="Alternar Tema"
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

        {/* NAVEGAÇÃO DE ABAS */}
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

        {/* ABA 1: ROLETA */}
        {activeTab === "roleta" && (
          <div>
            {winner && !mustSpin ? (
              <div
                className={`rounded-3xl p-6 md:p-10 flex flex-col items-center shadow-2xl border-2 border-blue-500/50 animate-in fade-in zoom-in duration-300 ${bgCard}`}
              >
                <p className="text-sm uppercase tracking-widest mb-2 font-bold text-blue-400">
                  Filme Sorteado
                </p>
                {winner.poster_path && (
                  <img
                    src={`https://image.tmdb.org/t/p/w300${winner.poster_path}`}
                    className="w-48 rounded-xl shadow-2xl mb-6 border border-zinc-700 hover:scale-105 transition-transform"
                    alt="Poster"
                  />
                )}
                <h3 className="text-2xl md:text-4xl font-extrabold text-blue-400 mb-2 text-center drop-shadow">
                  {winner.title}
                </h3>
                <p className="opacity-70 mb-8">
                  Da lista de:{" "}
                  <span className="font-bold">{winner.addedBy}</span>
                </p>

                <div className="flex flex-col sm:flex-row w-full max-w-md gap-3">
                  <button
                    onClick={() => markAsWatched(winner)}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white px-4 py-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-transform active:scale-95 shadow-lg shadow-emerald-900/30"
                  >
                    <CheckCircle className="w-5 h-5" /> Já Assistimos!
                  </button>
                  <button
                    onClick={() => setWinner(null)}
                    className="flex-1 bg-zinc-800 hover:bg-zinc-700 px-4 py-4 rounded-xl font-bold flex justify-center items-center gap-2 transition-transform active:scale-95 border border-zinc-700 shadow-lg"
                  >
                    <RefreshCw className="w-5 h-5" /> Girar Novamente
                  </button>
                </div>
              </div>
            ) : poolMovies.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-start">
                {/* LADO ESQUERDO: FILMES DELA (Ocupa 1 coluna) */}
                <div
                  className={`order-2 md:order-1 w-full p-4 rounded-2xl border ${bgCard} shadow-lg flex flex-col`}
                >
                  <h3 className="font-bold text-xs sm:text-sm text-pink-500 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                    <Film className="w-4 h-4" /> Lista Dela ({herMovies.length})
                  </h3>
                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[350px] pr-1">
                    {herMovies.map((m) => (
                      <div
                        key={m.id}
                        className="text-xs p-2.5 rounded-xl bg-zinc-500/10 flex items-center justify-between border border-zinc-500/5 hover:bg-zinc-500/20 transition-colors"
                      >
                        <span className="truncate">{m.title}</span>
                      </div>
                    ))}
                    {herMovies.length === 0 && (
                      <span className="text-xs opacity-40 italic">
                        Nenhum filme
                      </span>
                    )}
                  </div>
                </div>

                {/* CENTRO: A ROLETA (Ocupa 2 colunas para garantir visual grandioso e sem cortes) */}
                <div
                  className={`order-1 md:order-2 md:col-span-2 w-full rounded-3xl p-6 sm:p-8 flex flex-col items-center shadow-2xl border ${bgCard} text-center relative overflow-hidden`}
                >
                  <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

                  <h2 className="text-lg sm:text-xl font-bold mb-6 tracking-wide text-blue-400">
                    Roleta do Casal
                  </h2>

                  {/* Container expandido e sem restrição de corte */}
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
                    className="w-full max-w-xs mt-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-8 py-4 rounded-2xl font-bold text-lg shadow-xl shadow-blue-600/30 active:scale-95 transition-all"
                  >
                    {mustSpin ? "Girando a roleta..." : "Girar Roleta!"}
                  </button>
                </div>

                {/* LADO DIREITO: SEUS FILMES (Ocupa 1 coluna) */}
                <div
                  className={`order-3 md:order-3 w-full p-4 rounded-2xl border ${bgCard} shadow-lg flex flex-col`}
                >
                  <h3 className="font-bold text-xs sm:text-sm text-blue-500 mb-3 uppercase tracking-wider flex items-center gap-1.5">
                    <Film className="w-4 h-4" /> Sua Lista (
                    {myPoolMovies.length})
                  </h3>
                  <div className="flex flex-col gap-2 overflow-y-auto max-h-[350px] pr-1">
                    {myPoolMovies.map((m) => (
                      <div
                        key={m.id}
                        className="text-xs p-2.5 rounded-xl bg-zinc-500/10 flex items-center justify-between border border-zinc-500/5 hover:bg-zinc-500/20 transition-colors"
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
                  Vá na aba "Lista" e adicione filmes!
                </p>
              </div>
            )}
          </div>
        )}

        {/* ABA 2: MINHA LISTA */}
        {activeTab === "minha_lista" && (
          <div>
            <div
              className={`p-4 md:p-6 rounded-2xl border mb-6 shadow-xl ${bgCard}`}
            >
              <h2 className="font-bold text-lg mb-4 text-blue-400">
                Adicionar Filme / Série
              </h2>
              <form
                onSubmit={handleSearch}
                className="flex flex-col sm:flex-row gap-3"
              >
                <div className="relative flex-1">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Pesquisar..."
                    className={`w-full border rounded-xl py-3 pl-12 pr-4 focus:outline-none focus:border-blue-500 text-base shadow-inner ${bgInput}`}
                  />
                </div>
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-bold transition-colors shadow-md"
                >
                  Buscar
                </button>
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
                          alt="Poster"
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
                            (Ex: Cinema)
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <h2 className="text-xl font-bold mb-4">
              Seus Filmes na Roleta ({myMovies.length})
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {myMovies.map((movie) => (
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
                  <button
                    onClick={() => removeFromDb(movie.id)}
                    className="p-2.5 text-red-500 hover:bg-red-500/10 rounded-xl transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ABA 3: HISTÓRICO */}
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
                        Registrado por:{" "}
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

        {/* ABA 4: ESTATÍSTICAS */}
        {activeTab === "estatisticas" && (
          <div>
            <h2 className="text-xl md:text-2xl font-bold mb-6 text-blue-500">
              Placar do Bom Gosto 📊
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div
                className={`p-6 rounded-3xl border shadow-xl flex flex-col items-center text-center ${bgCard}`}
              >
                <Film className="w-8 h-8 text-blue-500 mb-3" />
                <h3 className="text-sm sm:text-base opacity-70 font-medium mb-1">
                  Filmes que Você Indicou
                </h3>
                <p className="text-4xl font-extrabold">{myWatchedCount}</p>
                <p className="text-xs opacity-50 mt-1">assistidos até hoje</p>
              </div>

              <div
                className={`p-6 rounded-3xl border shadow-xl flex flex-col items-center text-center ${bgCard}`}
              >
                <Film className="w-8 h-8 text-pink-500 mb-3" />
                <h3 className="text-sm sm:text-base opacity-70 font-medium mb-1">
                  Filmes que Ela Indicou
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
                  Nota Média da Lista DELA
                </h3>
                <p className="text-4xl font-extrabold">{partnerAvg}</p>
                <p className="text-xs opacity-50 mt-1">
                  Média de estrelas dos filmes dela
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER MINIMALISTA EM AZUL ESCURO */}
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
              </svg>
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
              </svg>
              GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
