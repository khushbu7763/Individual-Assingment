"use strict";

// API configuration

const API_BASE = "https://media2.edu.metropolia.fi/restaurant/api/v1";

const API = {
  restaurants: `${API_BASE}/restaurants`,
  daily: (id) => `${API_BASE}/restaurants/daily/${encodeURIComponent(id)}/en`,
  weekly: (id) => `${API_BASE}/restaurants/weekly/${encodeURIComponent(id)}/en`,
  login: `${API_BASE}/auth/login`,
  users: `${API_BASE}/users`,
};

// DOM elements

const $ = (selector) => document.querySelector(selector);

const restaurantList = $("#restaurantList");
const searchInput = $("#search");
const cityFilter = $("#cityFilter");
const providerFilter = $("#providerFilter");
const restaurantCount = $("#restaurantCount");
const statusMessage = $("#status");

const menuSection = $("#menuSection");
const restaurantName = $("#restaurantName");
const restaurantDetails = $("#restaurantDetails");
const menuContent = $("#menuContent");

const dailyBtn = $("#dailyBtn");
const weeklyBtn = $("#weeklyBtn");
const allBtn = $("#allBtn");
const favoritesBtn = $("#favoritesBtn");

const mapRestaurantSelect = $("#mapRestaurantSelect");
const mapStatus = $("#mapStatus");
const mapFrame = $("#restaurantMap");

const loginDialog = $("#loginDialog");
const registerDialog = $("#registerDialog");

const loginForm = $("#loginForm");
const registerForm = $("#registerForm");

const loginStatus = $("#loginStatus");
const registerStatus = $("#registerStatus");

const loginNav = $("#loginNav");
const registerNav = $("#registerNav");
const logoutBtn = $("#logoutBtn");
const welcomeMessage = $("#welcomeMessage");

// Application state

let restaurants = [];
let selectedRestaurant = null;
let showFavoritesOnly = false;
let menuRequestId = 0;

let currentUser = null;
let token = null;
let updatingFavorite = false;

const STORAGE_KEY = "studentFoodFavorites";

// Illustrative food images

const FOOD_IMAGES = [
  "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=700&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1547592180-85f173990554?w=700&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1511690743698-d9d85f2fbf38?w=700&auto=format&fit=crop&q=80",
  "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=700&auto=format&fit=crop&q=80",
];

// Local favorites

function loadFavorites() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");

    return new Set(Array.isArray(saved) ? saved.map(String) : []);
  } catch {
    return new Set();
  }
}

const favorites = loadFavorites();

function saveFavorites() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...favorites]));
  } catch (error) {
    console.error("Storage error:", error);
  }
}

// API requests

async function fetchData(url, options = {}) {
  const headers = {
    Accept: "application/json",
    ...options.headers,
  };

  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  let response;

  try {
    response = await fetch(url, {
      ...options,
      headers,
    });
  } catch (error) {
    console.error("Network request failed:", error);

    throw new Error(
      "Cannot connect to the server. Check your internet connection and browser permissions.",
    );
  }

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data?.message || data?.error || `Server error: HTTP ${response.status}`;

    throw new Error(
      typeof message === "string" ? message : JSON.stringify(message),
    );
  }

  if (data === null) {
    throw new Error("Invalid server response.");
  }

  return data;
}

// Normalize restaurant data

function normalizeRestaurant(item) {
  const coordinates = item.location?.coordinates;

  return {
    id: String(item._id ?? item.id ?? ""),
    name: String(item.name ?? "Unnamed Restaurant"),
    city: String(item.city ?? "Unknown"),
    address: String(item.address ?? ""),
    postalCode: String(item.postalCode ?? ""),
    phone: String(item.phone ?? ""),
    provider: String(item.company ?? "Unknown"),
    coordinates: Array.isArray(coordinates) ? coordinates : null,
  };
}

// Load restaurants

async function loadRestaurants() {
  statusMessage.textContent = "Loading restaurants...";

  try {
    const data = await fetchData(API.restaurants);

    const items = Array.isArray(data) ? data : (data.restaurants ?? data.data);

    if (!Array.isArray(items)) {
      throw new Error("Unexpected restaurant data format.");
    }

    restaurants = items.map(normalizeRestaurant).filter((item) => item.id);

    restaurants.sort((a, b) => a.name.localeCompare(b.name));

    populateFilters();
    populateMapSelect();
    displayRestaurants();

    statusMessage.textContent = restaurants.length
      ? ""
      : "No restaurants available.";
  } catch (error) {
    console.error(error);

    statusMessage.textContent = "Unable to load restaurants. " + error.message;

    restaurantCount.textContent = "Unavailable";

    restaurantList.replaceChildren();

    const retryButton = document.createElement("button");

    retryButton.type = "button";
    retryButton.className = "primary-button";
    retryButton.textContent = "Try Again";

    retryButton.addEventListener("click", loadRestaurants);

    restaurantList.appendChild(retryButton);
  }
}

// Filter options

function populateSelect(element, values, label) {
  element.replaceChildren();

  const first = document.createElement("option");

  first.value = "";
  first.textContent = label;

  element.appendChild(first);

  values.forEach((value) => {
    const option = document.createElement("option");

    option.value = value;
    option.textContent = value;

    element.appendChild(option);
  });
}

function populateFilters() {
  const cities = [...new Set(restaurants.map((item) => item.city))].sort();

  const providers = [
    ...new Set(restaurants.map((item) => item.provider)),
  ].sort();

  populateSelect(cityFilter, cities, "All Cities");

  populateSelect(providerFilter, providers, "All Providers");
}

// Favorite restaurants

function isFavorite(id) {
  if (currentUser) {
    return String(currentUser.favouriteRestaurant ?? "") === id;
  }

  return favorites.has(id);
}

async function toggleFavorite(id) {
  if (updatingFavorite) return;

  if (currentUser && token) {
    const activeToken = token;

    updatingFavorite = true;

    try {
      const favoriteId = isFavorite(id) ? null : id;

      const result = await fetchData(API.users, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          favouriteRestaurant: favoriteId,
        }),
      });

      if (token !== activeToken) return;

      if (!result.data) {
        throw new Error(result.message || "Favorite could not be updated.");
      }

      currentUser = {
        ...currentUser,
        ...result.data,
      };

      statusMessage.textContent = "Favorite restaurant updated.";
    } catch (error) {
      statusMessage.textContent = "Unable to update favorite: " + error.message;
    } finally {
      updatingFavorite = false;
    }
  } else {
    if (favorites.has(id)) {
      favorites.delete(id);

      statusMessage.textContent = "Restaurant removed from favorites.";
    } else {
      favorites.add(id);

      statusMessage.textContent = "Restaurant added to favorites.";
    }

    saveFavorites();
  }

  displayRestaurants();
}

function setFavoriteFilter(value) {
  showFavoritesOnly = value;

  allBtn.classList.toggle("active", !value);
  favoritesBtn.classList.toggle("active", value);

  displayRestaurants();
}

function resetFilters() {
  searchInput.value = "";
  cityFilter.value = "";
  providerFilter.value = "";
}

// Display restaurants

function displayRestaurants() {
  restaurantList.replaceChildren();

  const search = searchInput.value.trim().toLowerCase();

  const city = cityFilter.value;
  const provider = providerFilter.value;

  const filtered = restaurants.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search) ||
      item.city.toLowerCase().includes(search) ||
      item.address.toLowerCase().includes(search);

    const matchesCity = !city || item.city === city;

    const matchesProvider = !provider || item.provider === provider;

    const matchesFavorite = !showFavoritesOnly || isFavorite(item.id);

    return matchesSearch && matchesCity && matchesProvider && matchesFavorite;
  });

  restaurantCount.textContent = `${filtered.length} Restaurants`;

  if (!filtered.length) {
    const message = document.createElement("p");

    message.className = "empty-message";

    message.textContent = showFavoritesOnly
      ? "No favorite restaurants found."
      : "No restaurants match your search.";

    restaurantList.appendChild(message);

    return;
  }

  filtered.forEach((item) => {
    restaurantList.appendChild(createRestaurantCard(item));
  });
}

// Create restaurant cards

function createRestaurantCard(item) {
  const card = document.createElement("article");

  card.className = "restaurant-card";

  const imageBox = document.createElement("div");

  imageBox.className = "card-image";

  const image = document.createElement("img");

  const imageIndex =
    [...item.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) %
    FOOD_IMAGES.length;

  image.src = FOOD_IMAGES[imageIndex];
  image.alt = "Illustrative student lunch food";
  image.loading = "lazy";

  const favoriteBtn = document.createElement("button");

  favoriteBtn.type = "button";
  favoriteBtn.className = "favorite-button";

  favoriteBtn.textContent = isFavorite(item.id) ? "♥" : "♡";

  favoriteBtn.classList.toggle("saved", isFavorite(item.id));

  favoriteBtn.setAttribute(
    "aria-label",
    isFavorite(item.id) ? "Remove favorite" : "Add favorite",
  );

  favoriteBtn.setAttribute("aria-pressed", String(isFavorite(item.id)));

  favoriteBtn.addEventListener("click", async () => {
    favoriteBtn.disabled = true;

    try {
      await toggleFavorite(item.id);
    } finally {
      favoriteBtn.disabled = false;
    }
  });

  imageBox.append(image, favoriteBtn);

  const body = document.createElement("div");

  body.className = "card-body";

  const name = document.createElement("h3");
  name.textContent = item.name;

  const city = document.createElement("p");
  city.textContent = `📍 ${item.city}`;

  const address = document.createElement("p");

  address.textContent = [item.address, item.postalCode]
    .filter(Boolean)
    .join(", ");

  const provider = document.createElement("span");

  provider.className = "provider-badge";
  provider.textContent = item.provider;

  const buttons = document.createElement("div");

  buttons.className = "card-buttons";

  const menuBtn = document.createElement("button");

  menuBtn.type = "button";
  menuBtn.className = "primary-button";
  menuBtn.textContent = "View Menu";

  menuBtn.addEventListener("click", () => selectRestaurant(item));

  const mapBtn = document.createElement("button");

  mapBtn.type = "button";
  mapBtn.className = "map-button";
  mapBtn.textContent = "📍 Map";

  mapBtn.addEventListener("click", () => showRestaurantOnMap(item));

  buttons.append(menuBtn, mapBtn);

  body.append(name, city, address, provider, buttons);

  card.append(imageBox, body);

  return card;
}

// Select a restaurant

function selectRestaurant(restaurant) {
  selectedRestaurant = restaurant;

  restaurantName.textContent = restaurant.name;

  restaurantDetails.textContent = [
    restaurant.address,
    restaurant.city,
    restaurant.provider,
  ]
    .filter(Boolean)
    .join(" • ");

  menuSection.hidden = false;

  menuSection.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });

  loadMenu("daily");
}

// Load daily and weekly menus

async function loadMenu(type) {
  if (!selectedRestaurant) return;

  const requestId = ++menuRequestId;

  dailyBtn.classList.toggle("active", type === "daily");

  weeklyBtn.classList.toggle("active", type === "weekly");

  menuContent.textContent = "Loading menu...";

  const url =
    type === "daily"
      ? API.daily(selectedRestaurant.id)
      : API.weekly(selectedRestaurant.id);

  try {
    const data = await fetchData(url);

    if (requestId !== menuRequestId) return;

    renderMenu(data, type);
  } catch (error) {
    if (requestId !== menuRequestId) return;

    menuContent.replaceChildren();

    const message = document.createElement("p");

    message.className = "error-message";

    message.textContent = "Unable to load menu. " + error.message;

    menuContent.appendChild(message);
  }
}

// Normalize menu data

function normalizeDays(data, type) {
  const root = data?.menu ?? data?.data ?? data;

  if (Array.isArray(root?.days)) {
    return root.days;
  }

  if (Array.isArray(root?.courses)) {
    return [
      {
        date: root.date ?? "Today's Menu",
        courses: root.courses,
      },
    ];
  }

  if (Array.isArray(root)) {
    if (root.some((item) => Array.isArray(item?.courses))) {
      return root;
    }

    return [
      {
        date: type === "daily" ? "Today's Menu" : "Weekly Menu",
        courses: root,
      },
    ];
  }

  return [];
}

// Display menus

function renderMenu(data, type) {
  menuContent.replaceChildren();

  const days = normalizeDays(data, type);

  if (!days.length) {
    const empty = document.createElement("p");

    empty.className = "empty-message";

    empty.textContent = "No menu information available.";

    menuContent.appendChild(empty);

    return;
  }

  days.forEach((day) => {
    const section = document.createElement("section");

    section.className = "menu-day";

    const heading = document.createElement("h3");

    heading.textContent = day.date ?? "Lunch Menu";

    section.appendChild(heading);

    const courses = Array.isArray(day.courses) ? day.courses : [];

    if (!courses.length) {
      const empty = document.createElement("p");

      empty.textContent = "No meals listed for this day.";

      section.appendChild(empty);
    }

    courses.forEach((course) => {
      const dish = document.createElement("div");

      dish.className = "dish";

      const title = document.createElement("strong");

      title.textContent =
        typeof course === "string" ? course : (course?.name ?? "Meal");

      const details = document.createElement("small");

      const price = course?.price ?? "";
      const diets = course?.diets ?? "";

      details.textContent = [
        price,
        Array.isArray(diets) ? diets.join(", ") : diets,
      ]
        .filter(Boolean)
        .join(" • ");

      dish.append(title, details);

      section.appendChild(dish);
    });

    menuContent.appendChild(section);
  });
}

// Restaurant map

function populateMapSelect() {
  mapRestaurantSelect.replaceChildren();

  const first = document.createElement("option");

  first.value = "";
  first.textContent = "Select a restaurant";

  mapRestaurantSelect.appendChild(first);

  restaurants.forEach((item) => {
    const option = document.createElement("option");

    option.value = item.id;

    option.textContent = `${item.name} - ${item.city}`;

    mapRestaurantSelect.appendChild(option);
  });
}

function showRestaurantOnMap(restaurant) {
  mapRestaurantSelect.value = restaurant.id;

  const coordinates = restaurant.coordinates;

  let query;

  // API coordinates are longitude and latitude.

  if (
    Array.isArray(coordinates) &&
    coordinates.length >= 2 &&
    Number.isFinite(coordinates[0]) &&
    Number.isFinite(coordinates[1]) &&
    Math.abs(coordinates[0]) <= 180 &&
    Math.abs(coordinates[1]) <= 90 &&
    !(coordinates[0] === 0 && coordinates[1] === 0)
  ) {
    const [longitude, latitude] = coordinates;

    query = `${latitude},${longitude}`;
  } else {
    query = [restaurant.name, restaurant.address, restaurant.city, "Finland"]
      .filter(Boolean)
      .join(", ");
  }

  mapStatus.textContent = [restaurant.name, restaurant.address, restaurant.city]
    .filter(Boolean)
    .join(" — ");

  mapFrame.src =
    "https://maps.google.com/maps?q=" +
    encodeURIComponent(query) +
    "&z=16&output=embed";

  $("#mapSection").scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

// Customer registration

registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = registerForm.querySelector('button[type="submit"]');

  const username = $("#registerUsername").value.trim();
  const email = $("#registerEmail").value.trim();
  const password = $("#registerPassword").value;

  if (!username || !email || !password) {
    registerStatus.textContent = "Please fill in all fields.";

    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    registerStatus.textContent = "Please enter a valid email address.";

    return;
  }

  if (password.length < 8) {
    registerStatus.textContent = "Password must contain at least 8 characters.";

    return;
  }

  submitButton.disabled = true;

  registerStatus.textContent = "Creating account...";

  try {
    const result = await fetchData(API.users, {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
        email,
      }),
    });

    if (!result.data) {
      throw new Error(
        result.message || "Registration failed. Please try again.",
      );
    }

    registerStatus.replaceChildren();

    const successMessage = document.createElement("p");

    successMessage.textContent = "Account created successfully!";

    registerStatus.appendChild(successMessage);

    if (result.activationUrl) {
      const activationMessage = document.createElement("p");

      activationMessage.textContent =
        "Please activate your account before logging in.";

      registerStatus.appendChild(activationMessage);

      try {
        const activationUrl = new URL(result.activationUrl, API_BASE + "/");

        if (
          activationUrl.protocol === "https:" &&
          activationUrl.origin === new URL(API_BASE).origin
        ) {
          const link = document.createElement("a");

          link.href = activationUrl.href;
          link.textContent = "Activate account";
          link.target = "_blank";
          link.rel = "noopener noreferrer";

          registerStatus.appendChild(link);
        } else {
          activationMessage.textContent =
            "Check your email or contact the course administrator for activation instructions.";
        }
      } catch {
        activationMessage.textContent =
          "Check your email for account activation instructions.";
      }
    } else if (result.data.activated === false) {
      const message = document.createElement("p");

      message.textContent =
        "Your account requires activation. Check your email.";

      registerStatus.appendChild(message);
    } else {
      const loginButton = document.createElement("button");

      loginButton.type = "button";
      loginButton.className = "primary-button";
      loginButton.textContent = "Go to Login";

      loginButton.addEventListener("click", () => {
        registerDialog.close();

        $("#loginUsername").value = username;

        loginStatus.textContent = "";

        loginDialog.showModal();
      });

      registerStatus.appendChild(loginButton);
    }

    registerForm.reset();
  } catch (error) {
    console.error("Registration error:", error);

    // Handle the API email authentication error.

    if (
      error.message.includes("535") ||
      error.message.includes("Authentication failed")
    ) {
      registerStatus.textContent =
        "Registration is temporarily unavailable due to a server issue. Please try again later.";
    } else {
      registerStatus.textContent = "Registration failed: " + error.message;
    }
  } finally {
    submitButton.disabled = false;
  }
});

// Customer login

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const submitButton = loginForm.querySelector('button[type="submit"]');

  const username = $("#loginUsername").value.trim();
  const password = $("#loginPassword").value;

  if (!username || !password) {
    loginStatus.textContent = "Please enter your username and password.";

    return;
  }

  submitButton.disabled = true;

  loginStatus.textContent = "Logging in...";

  try {
    const result = await fetchData(API.login, {
      method: "POST",
      body: JSON.stringify({
        username,
        password,
      }),
    });

    if (!result.token || !result.data) {
      throw new Error(result.message || "Invalid username or password.");
    }

    token = result.token;
    currentUser = result.data;

    loginForm.reset();

    loginStatus.textContent = "";

    loginDialog.close();

    updateAuthUI();

    displayRestaurants();

    statusMessage.textContent = "You have successfully logged in.";
  } catch (error) {
    console.error("Login error:", error);

    loginStatus.textContent = "Login failed: " + error.message;
  } finally {
    submitButton.disabled = false;
  }
});

// Update login interface

function updateAuthUI() {
  const loggedIn = Boolean(currentUser && token);

  loginNav.hidden = loggedIn;
  registerNav.hidden = loggedIn;
  logoutBtn.hidden = !loggedIn;

  welcomeMessage.textContent = loggedIn
    ? `Welcome, ${currentUser.username}!`
    : "";

  favoritesBtn.textContent = loggedIn ? "♥ Account Favorite" : "♥ My Favorites";
}

// Logout

logoutBtn.addEventListener("click", () => {
  token = null;
  currentUser = null;

  statusMessage.textContent = "You have been logged out.";

  updateAuthUI();

  displayRestaurants();
});

// Dialog events

loginNav.addEventListener("click", () => {
  loginStatus.textContent = "";

  loginDialog.showModal();
});

registerNav.addEventListener("click", () => {
  registerStatus.textContent = "";

  registerDialog.showModal();
});

document.querySelectorAll("[data-close]").forEach((button) => {
  button.addEventListener("click", () => {
    const dialog = document.getElementById(button.dataset.close);

    dialog?.close();
  });
});

// Search and filter events

searchInput.addEventListener("input", displayRestaurants);

cityFilter.addEventListener("change", displayRestaurants);

providerFilter.addEventListener("change", displayRestaurants);

allBtn.addEventListener("click", () => {
  resetFilters();

  setFavoriteFilter(false);
});

favoritesBtn.addEventListener("click", () => {
  resetFilters();

  setFavoriteFilter(true);
});

$("#navFavorites")?.addEventListener("click", () => {
  resetFilters();

  setFavoriteFilter(true);
});

$("#navRestaurants")?.addEventListener("click", () => {
  resetFilters();

  setFavoriteFilter(false);
});

$("#footerFavorites")?.addEventListener("click", () => {
  resetFilters();

  setFavoriteFilter(true);
});

// Menu events

dailyBtn.addEventListener("click", () => {
  loadMenu("daily");
});

weeklyBtn.addEventListener("click", () => {
  loadMenu("weekly");
});

$("#closeMenu").addEventListener("click", () => {
  ++menuRequestId;

  selectedRestaurant = null;

  menuSection.hidden = true;
});

// Map events

$("#findOnMapBtn").addEventListener("click", () => {
  const id = mapRestaurantSelect.value;

  const restaurant = restaurants.find((item) => item.id === id);

  if (!restaurant) {
    mapStatus.textContent = "Please select a restaurant.";

    return;
  }

  showRestaurantOnMap(restaurant);
});

// Start application

updateAuthUI();
loadRestaurants();
