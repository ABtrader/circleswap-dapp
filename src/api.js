const API_URL =
  import.meta.env.VITE_API_URL?.replace(/\/$/, "") ||
  "https://circleswap-dapp-backend.onrender.com";

console.log("CircleSwap API URL:", API_URL);

async function apiRequest(path, options = {}) {
  try {
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      mode: "cors",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch (error) {
      console.error("Invalid backend response text:", text);

      return {
        success: false,
        error: "Invalid backend response",
      };
    }

    if (!response.ok) {
      return {
        success: false,
        error: data?.error || `Backend request failed with status ${response.status}`,
      };
    }

    return data;
  } catch (error) {
    console.error(`API request failed for ${path}:`, error);

    return {
      success: false,
      error:
        "Could not connect to backend. Confirm backend URL, CORS, and Vercel deployment.",
    };
  }
}

export async function registerUser(username, wallet) {
  return apiRequest("/register", {
    method: "POST",
    body: JSON.stringify({ username, wallet }),
  });
}

export async function resolveUser(input) {
  return apiRequest("/resolve", {
    method: "POST",
    body: JSON.stringify({ input }),
  });
}

export async function getAllUsers() {
  return apiRequest("/users");
}

export { API_URL };