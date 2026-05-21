import { store } from './store.js';
// Wywołanie metody resetującej bazę danych (czyści tablice JSON i wgrywa dane początkowe)
store.reset();
// Informacja w konsoli o pomyślnym zakończeniu operacji resetowania
console.log('Baza JSON zresetowana.');