import { initializeApp } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.12.1/firebase-auth.js";

// REEMPLAZAR con la config del nuevo proyecto Firebase de EURUS
// Firebase Console → Project Settings → General → Tu app web → firebaseConfig
const firebaseConfig = {
  apiKey: "AIzaSyCL9kLYlg8bFtuT-flPfLMZe31CqTtiGbw",
  authDomain: "eurusconf-59ac2.firebaseapp.com",
  projectId: "eurusconf-59ac2",
  storageBucket: "eurusconf-59ac2.firebasestorage.app",
  messagingSenderId: "1025965722820",
  appId: "1:1025965722820:web:e31a1bbac9c79d179c0d91",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
