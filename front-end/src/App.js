import logo from './logo.svg';
import './App.css';
import Login from "./login.js";

function App() {
  const handleLogin = (token) => {
    console.log("Logged in token:", token);
  };

  return <Login onLogin={handleLogin} />;
}

export default App;