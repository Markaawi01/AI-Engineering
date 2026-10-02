// Sample data for the database. Ratings are roughly IMDb-style (0-10).

export const movies = [
  { title: 'Inception', year: 2010, genre: 'Sci-Fi', rating: 8.8, director: 'Christopher Nolan', description: 'A thief who steals secrets through dreams is asked to plant an idea instead.' },
  { title: 'Interstellar', year: 2014, genre: 'Sci-Fi', rating: 8.7, director: 'Christopher Nolan', description: 'Explorers travel through a wormhole to find a new home for humanity.' },
  { title: 'The Matrix', year: 1999, genre: 'Sci-Fi', rating: 8.7, director: 'Lana Wachowski', description: 'A hacker learns that reality is a simulation and joins the rebellion.' },
  { title: 'Blade Runner 2049', year: 2017, genre: 'Sci-Fi', rating: 8.0, director: 'Denis Villeneuve', description: 'A young blade runner uncovers a secret that could plunge society into chaos.' },
  { title: 'Arrival', year: 2016, genre: 'Sci-Fi', rating: 7.9, director: 'Denis Villeneuve', description: 'A linguist works to communicate with mysterious alien visitors.' },
  { title: 'Dune', year: 2021, genre: 'Sci-Fi', rating: 8.0, director: 'Denis Villeneuve', description: 'A noble family becomes embroiled in a war for the desert planet Arrakis.' },
  { title: 'Ex Machina', year: 2014, genre: 'Sci-Fi', rating: 7.7, director: 'Alex Garland', description: 'A programmer evaluates the human qualities of a humanoid AI.' },
  { title: 'Alien', year: 1979, genre: 'Horror', rating: 8.5, director: 'Ridley Scott', description: 'The crew of a spaceship is hunted by a deadly alien creature.' },
  { title: 'The Shawshank Redemption', year: 1994, genre: 'Drama', rating: 9.3, director: 'Frank Darabont', description: 'Two imprisoned men bond over years, finding hope and redemption.' },
  { title: 'Forrest Gump', year: 1994, genre: 'Drama', rating: 8.8, director: 'Robert Zemeckis', description: 'A kind man with a low IQ witnesses decades of American history.' },
  { title: 'Fight Club', year: 1999, genre: 'Drama', rating: 8.8, director: 'David Fincher', description: 'An insomniac and a soap maker form an underground fight club.' },
  { title: 'Whiplash', year: 2014, genre: 'Drama', rating: 8.5, director: 'Damien Chazelle', description: 'A young drummer is pushed to the limit by a ruthless instructor.' },
  { title: 'Parasite', year: 2019, genre: 'Thriller', rating: 8.5, director: 'Bong Joon Ho', description: 'A poor family schemes to become employed by a wealthy household.' },
  { title: 'The Godfather', year: 1972, genre: 'Crime', rating: 9.2, director: 'Francis Ford Coppola', description: 'The aging head of a crime dynasty hands control to his reluctant son.' },
  { title: 'Pulp Fiction', year: 1994, genre: 'Crime', rating: 8.9, director: 'Quentin Tarantino', description: 'Interlocking stories of criminals in Los Angeles.' },
  { title: 'The Dark Knight', year: 2008, genre: 'Action', rating: 9.0, director: 'Christopher Nolan', description: 'Batman faces the Joker, a criminal who wants to plunge Gotham into anarchy.' },
  { title: 'Mad Max: Fury Road', year: 2015, genre: 'Action', rating: 8.1, director: 'George Miller', description: 'In a desert wasteland, a woman rebels against a tyrant with the help of a drifter.' },
  { title: 'Gladiator', year: 2000, genre: 'Action', rating: 8.5, director: 'Ridley Scott', description: 'A betrayed Roman general seeks revenge as a gladiator.' },
  { title: 'John Wick', year: 2014, genre: 'Action', rating: 7.4, director: 'Chad Stahelski', description: 'A retired hitman seeks vengeance after gangsters take everything from him.' },
  { title: 'Top Gun: Maverick', year: 2022, genre: 'Action', rating: 8.2, director: 'Joseph Kosinski', description: 'A veteran pilot trains young graduates for a dangerous mission.' },
  { title: 'Spirited Away', year: 2001, genre: 'Animation', rating: 8.6, director: 'Hayao Miyazaki', description: 'A girl wanders into a world of spirits and must free her parents.' },
  { title: 'Toy Story', year: 1995, genre: 'Animation', rating: 8.3, director: 'John Lasseter', description: 'A cowboy doll feels threatened when a new space ranger toy arrives.' },
  { title: 'Coco', year: 2017, genre: 'Animation', rating: 8.4, director: 'Lee Unkrich', description: 'A boy who dreams of music journeys to the Land of the Dead.' },
  { title: 'Spider-Man: Into the Spider-Verse', year: 2018, genre: 'Animation', rating: 8.4, director: 'Bob Persichetti', description: 'Teen Miles Morales becomes Spider-Man and meets heroes from other dimensions.' },
  { title: 'Up', year: 2009, genre: 'Animation', rating: 8.3, director: 'Pete Docter', description: 'An old man ties balloons to his house and flies to South America.' },
  { title: 'The Grand Budapest Hotel', year: 2014, genre: 'Comedy', rating: 8.1, director: 'Wes Anderson', description: 'A hotel concierge and his lobby boy are framed for murder.' },
  { title: 'Superbad', year: 2007, genre: 'Comedy', rating: 7.6, director: 'Greg Mottola', description: 'Two friends try to enjoy one last party before graduation.' },
  { title: 'The Hangover', year: 2009, genre: 'Comedy', rating: 7.7, director: 'Todd Phillips', description: 'Three friends wake up after a bachelor party and cannot find the groom.' },
  { title: 'Knives Out', year: 2019, genre: 'Comedy', rating: 7.9, director: 'Rian Johnson', description: 'A detective investigates the death of a wealthy crime novelist.' },
  { title: 'La La Land', year: 2016, genre: 'Romance', rating: 8.0, director: 'Damien Chazelle', description: 'A jazz pianist and an actress fall in love while chasing their dreams.' },
  { title: 'Titanic', year: 1997, genre: 'Romance', rating: 7.9, director: 'James Cameron', description: 'A young aristocrat falls for a poor artist aboard the doomed ship.' },
  { title: 'Before Sunrise', year: 1995, genre: 'Romance', rating: 8.1, director: 'Richard Linklater', description: 'Two strangers meet on a train and spend one night in Vienna.' },
  { title: 'Get Out', year: 2017, genre: 'Horror', rating: 7.8, director: 'Jordan Peele', description: 'A man uncovers a disturbing secret when he meets his girlfriend\'s family.' },
  { title: 'The Shining', year: 1980, genre: 'Horror', rating: 8.4, director: 'Stanley Kubrick', description: 'A writer becomes violent while caretaking an isolated hotel.' },
  { title: 'A Quiet Place', year: 2018, genre: 'Horror', rating: 7.5, director: 'John Krasinski', description: 'A family must live in silence to hide from creatures that hunt by sound.' },
  { title: 'The Lord of the Rings: The Fellowship of the Ring', year: 2001, genre: 'Fantasy', rating: 8.9, director: 'Peter Jackson', description: 'A hobbit sets out to destroy a powerful ring.' },
  { title: 'Harry Potter and the Prisoner of Azkaban', year: 2004, genre: 'Fantasy', rating: 7.9, director: 'Alfonso Cuaron', description: 'Harry learns that a dangerous prisoner has escaped and is after him.' },
  { title: 'Pan\'s Labyrinth', year: 2006, genre: 'Fantasy', rating: 8.2, director: 'Guillermo del Toro', description: 'A girl in 1944 Spain escapes into a dark fairy-tale world.' },
  { title: 'Raiders of the Lost Ark', year: 1981, genre: 'Adventure', rating: 8.4, director: 'Steven Spielberg', description: 'Archaeologist Indiana Jones races the Nazis to find the Ark of the Covenant.' },
  { title: 'Jurassic Park', year: 1993, genre: 'Adventure', rating: 8.2, director: 'Steven Spielberg', description: 'A theme park of cloned dinosaurs breaks down during a preview tour.' },
  { title: 'Life of Pi', year: 2012, genre: 'Adventure', rating: 7.9, director: 'Ang Lee', description: 'A young man survives a shipwreck on a lifeboat with a Bengal tiger.' },
  { title: 'Se7en', year: 1995, genre: 'Thriller', rating: 8.6, director: 'David Fincher', description: 'Two detectives hunt a serial killer who uses the seven deadly sins.' },
  { title: 'Gone Girl', year: 2014, genre: 'Thriller', rating: 8.1, director: 'David Fincher', description: 'A man becomes the main suspect when his wife disappears.' },
  { title: 'Prisoners', year: 2013, genre: 'Thriller', rating: 8.1, director: 'Denis Villeneuve', description: 'A father takes matters into his own hands when his daughter goes missing.' },
].map((m, i) => ({ movieId: i + 1, ...m }));

export const users = [
  { name: 'Amina Hassan', email: 'amina@example.com', age: 24, favorite_genre: 'Sci-Fi' },
  { name: 'Omar Ali', email: 'omar@example.com', age: 31, favorite_genre: 'Action' },
  { name: 'Fatima Noor', email: 'fatima@example.com', age: 19, favorite_genre: 'Animation' },
  { name: 'Yusuf Ahmed', email: 'yusuf@example.com', age: 42, favorite_genre: 'Drama' },
  { name: 'Hodan Warsame', email: 'hodan@example.com', age: 27, favorite_genre: 'Romance' },
  { name: 'Abdi Farah', email: 'abdi@example.com', age: 35, favorite_genre: 'Crime' },
  { name: 'Sara Mohamed', email: 'sara@example.com', age: 22, favorite_genre: 'Comedy' },
  { name: 'Khalid Ibrahim', email: 'khalid@example.com', age: 55, favorite_genre: 'Thriller' },
  { name: 'Leila Osman', email: 'leila@example.com', age: 29, favorite_genre: 'Fantasy' },
  { name: 'Hassan Jama', email: 'hassan@example.com', age: 38, favorite_genre: 'Sci-Fi' },
  { name: 'Maryan Aden', email: 'maryan@example.com', age: 25, favorite_genre: 'Horror' },
  { name: 'Ismail Yusuf', email: 'ismail@example.com', age: 17, favorite_genre: 'Adventure' },
].map((u, i) => ({ userId: i + 1, ...u }));

const comments = [
  'Absolutely loved it!', 'Great story and acting.', 'A bit too long for me.', 'Visually stunning.',
  'I would watch it again.', 'Not my favorite, but solid.', 'The ending blew my mind.', 'Perfect for a movie night.',
  'Overrated, in my opinion.', 'A true classic.',
];

// 40 reviews spread over users and movies (deterministic, so every seed gives the same data)
export const reviews = Array.from({ length: 40 }, (_, i) => {
  const movie = movies[(i * 7) % movies.length];
  const rating = Math.max(1, Math.min(10, Math.round(movie.rating + ((i % 5) - 2) * 0.8)));
  return {
    reviewId: i + 1,
    movie_id: movie.movieId,
    user_id: (i % users.length) + 1,
    rating,
    comment: comments[i % comments.length],
    date: new Date(Date.UTC(2025, i % 12, (i % 27) + 1)),
  };
});

// Offline jokes: used when icanhazdadjoke is not reachable
export const localJokes = ([
  { category: 'dad', text: 'I only know 25 letters of the alphabet. I don\'t know y.' },
  { category: 'dad', text: 'Why don\'t eggs tell jokes? They\'d crack each other up.' },
  { category: 'dad', text: 'I used to hate facial hair, but then it grew on me.' },
  { category: 'dad', text: 'What do you call a fake noodle? An impasta.' },
  { category: 'dad', text: 'I\'m reading a book about anti-gravity. It\'s impossible to put down.' },
  { category: 'programming', text: 'Why do programmers prefer dark mode? Because light attracts bugs.' },
  { category: 'programming', text: 'There are 10 kinds of people: those who understand binary and those who don\'t.' },
  { category: 'programming', text: 'A SQL query walks into a bar, walks up to two tables and asks: "Can I join you?"' },
  { category: 'programming', text: 'Why did the developer go broke? Because he used up all his cache.' },
  { category: 'programming', text: 'How many programmers does it take to change a light bulb? None, that\'s a hardware problem.' },
  { category: 'general', text: 'Why did the scarecrow win an award? He was outstanding in his field.' },
  { category: 'general', text: 'What do you call a bear with no teeth? A gummy bear.' },
  { category: 'general', text: 'Why can\'t a bicycle stand up by itself? It\'s two tired.' },
  { category: 'general', text: 'What did the ocean say to the beach? Nothing, it just waved.' },
  { category: 'general', text: 'Why did the math book look sad? It had too many problems.' },
] as { category: 'dad' | 'programming' | 'general'; text: string }[]).map((j, i) => ({ jokeId: `local-${i + 1}`, source: 'local' as const, ...j }));
