(function () {
  "use strict";

  const API_BASE = window.location.origin === "http://localhost:4000"
    ? "/api"
    : "http://localhost:4000/api";
  const SESSION_KEY = "sb_session";
  const THEME_KEY = "sb_theme";
  const REQUEST_TIMEOUT_MS = 60000;

  const path = (window.location.pathname.split("/").pop() || "index.html").toLowerCase();
  const publicPages = new Set(["index.html", "login.html", "signup.html", "help.html"]);
  const query = new URLSearchParams(window.location.search);

  let currentUserCache = null;

  function getSession() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    } catch (_) {
      return null;
    }
  }

  function setSession(session) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  function getTheme() {
    return localStorage.getItem(THEME_KEY) === "light" ? "light" : "dark";
  }

  function applyTheme(theme) {
    const nextTheme = theme === "light" ? "light" : "dark";
    document.body.classList.toggle("theme-light", nextTheme === "light");
    document.body.classList.toggle("theme-dark", nextTheme === "dark");
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.textContent = nextTheme === "light" ? "Dark Mode" : "Bright Mode";
      btn.setAttribute("aria-label", "Switch to " + (nextTheme === "light" ? "dark" : "bright") + " mode");
    });
  }

  function bindThemeToggle() {
    const host = document.querySelector(".nav-links") || document.querySelector(".topbar") || document.querySelector(".login-box") || document.querySelector(".signup-box");
    if (host && !host.querySelector("[data-theme-toggle]")) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "theme-toggle";
      btn.dataset.themeToggle = "true";
      btn.addEventListener("click", function () {
        const nextTheme = getTheme() === "light" ? "dark" : "light";
        localStorage.setItem(THEME_KEY, nextTheme);
        applyTheme(nextTheme);
      });
      const userDp = host.querySelector(".user-dp");
      if (userDp) host.insertBefore(btn, userDp);
      else host.appendChild(btn);
    }

    applyTheme(getTheme());
  }

  function getNextDestination(defaultPath) {
    const next = query.get("next");
    if (!next) return defaultPath;
    if (!/^[a-z0-9\-_.]+\.html(\?.*)?$/i.test(next)) return defaultPath;
    return next;
  }

  function getRole(user) {
    return user && user.profile && user.profile.role === "Client" ? "Client" : "Freelancer";
  }

  function isClient(user) {
    return getRole(user) === "Client";
  }

  function ensureProtectedRoute() {
    if (publicPages.has(path)) return;
    const session = getSession();
    if (!session || !session.email || !session.token) {
      const currentTarget = path + window.location.search;
      window.location.href = "login.html?next=" + encodeURIComponent(currentTarget);
    }
  }

  async function api(pathname, options) {
    const controller = new AbortController();
    const timer = setTimeout(function () {
      controller.abort();
    }, REQUEST_TIMEOUT_MS);
    const session = getSession();
    const headers = { "Content-Type": "application/json" };
    if (session && session.token) {
      headers.Authorization = "Bearer " + session.token;
    }

    try {
      const res = await fetch(API_BASE + pathname, {
        method: (options && options.method) || "GET",
        headers: headers,
        body: options && options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal
      });

      const data = await res.json().catch(function () {
        return { ok: false, message: "Invalid server response" };
      });

      if (!res.ok || !data.ok) {
        throw new Error(data.message || "Request failed");
      }

      return data;
    } catch (err) {
      if (err && err.name === "AbortError") {
        throw new Error("Request timed out. Please try again.");
      }

      if (err instanceof TypeError) {
        throw new Error("Backend not reachable. Start server: node backend/server.js");
      }

      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function downloadFile(pathname, fileName) {
    const session = getSession();
    if (!session || !session.token) {
      throw new Error("Login required to download files.");
    }
    const target = pathname && pathname.indexOf("/api/") === 0
      ? pathname
      : API_BASE + pathname;

    const res = await fetch(target, {
      headers: {
        Authorization: "Bearer " + session.token
      }
    });

    if (!res.ok) {
      const data = await res.json().catch(function () {
        return { message: "File download failed" };
      });
      throw new Error(data.message || "File download failed");
    }

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName || "attachment";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function readFileAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      const reader = new FileReader();
      reader.onload = function (event) {
        const result = event.target && event.target.result;
        if (typeof result === "string") resolve(result);
        else reject(new Error("Could not read selected file."));
      };
      reader.onerror = function () {
        reject(new Error("Could not read selected file."));
      };
      reader.readAsDataURL(file);
    });
  }

  async function makeAttachment(file) {
    if (!file) return null;
    const maxBytes = 25 * 1024 * 1024;
    if (file.size > maxBytes) {
      throw new Error("File must be 25 MB or smaller.");
    }

    return {
      fileName: file.name,
      fileType: file.type || "application/octet-stream",
      fileSize: file.size,
      dataUrl: await readFileAsDataUrl(file)
    };
  }

  function formatFileSize(bytes) {
    const size = Number(bytes || 0);
    if (size >= 1024 * 1024) return (size / (1024 * 1024)).toFixed(1) + " MB";
    if (size >= 1024) return Math.round(size / 1024) + " KB";
    return size + " B";
  }

  function setFormLoading(form, isLoading, loadingText) {
    if (!form) return;
    const submitBtn = form.querySelector('button[type="submit"], .login-btn, .signup-btn');
    if (!submitBtn) return;

    if (!submitBtn.dataset.originalText) {
      submitBtn.dataset.originalText = submitBtn.textContent || "Submit";
    }

    submitBtn.disabled = isLoading;
    submitBtn.style.opacity = isLoading ? "0.75" : "1";
    submitBtn.style.cursor = isLoading ? "not-allowed" : "pointer";
    submitBtn.textContent = isLoading ? (loadingText || "Please wait...") : submitBtn.dataset.originalText;
  }

  function showFormMessage(form, message, isError) {
    if (!form) return;
    let node = form.parentElement.querySelector(".form-alert");
    if (!node) {
      node = document.createElement("p");
      node.className = "form-alert";
      form.parentElement.insertBefore(node, form);
    }
    node.textContent = message;
    node.style.margin = "10px 0";
    node.style.padding = "10px";
    node.style.borderRadius = "8px";
    node.style.fontSize = "14px";
    node.style.background = isError ? "#7f1d1d" : "#064e3b";
    node.style.color = "#fff";
    node.style.border = isError ? "1px solid #ef4444" : "1px solid #10b981";
  }

  function markActiveSidebar() {
    document.querySelectorAll(".sidebar a").forEach(function (a) {
      const href = (a.getAttribute("href") || "").toLowerCase();
      if (href === path) {
        a.style.color = "#ffffff";
        a.style.fontWeight = "700";
      }
    });
  }

  function applyRoleNavigation(user) {
    if (!user) return;

    const hiddenForClient = new Set(["mygigs.html", "browse-jobs.html"]);
    const hiddenForFreelancer = new Set(["post-job.html", "orders.html"]);
    const hiddenLinks = isClient(user) ? hiddenForClient : hiddenForFreelancer;

    document.querySelectorAll(".sidebar a").forEach(function (a) {
      const href = (a.getAttribute("href") || "").split("?")[0].toLowerCase();
      const item = a.closest("li");
      if (item) item.style.display = "";
      if (hiddenLinks.has(href)) {
        if (item) item.style.display = "none";
      }
    });

    if (hiddenLinks.has(path)) {
      window.location.href = "dashboard.html";
    }
  }

  function bindSidebarLogo() {
    document.querySelectorAll(".sidebar h2").forEach(function (logo) {
      logo.setAttribute("role", "link");
      logo.setAttribute("tabindex", "0");
      logo.style.cursor = "pointer";
      logo.addEventListener("click", function () {
        window.location.href = "index.html";
      });
      logo.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          window.location.href = "index.html";
        }
      });
    });
  }

  function bindLogout() {
    document.querySelectorAll(".logout-item a").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        clearSession();
        currentUserCache = null;
        window.location.href = "index.html";
      });
    });
  }

  async function getCurrentUser(force) {
    if (!force && currentUserCache) return currentUserCache;

    const session = getSession();
    if (!session || !session.email) return null;

    try {
      const data = await api("/users/" + encodeURIComponent(session.email));
      currentUserCache = data.user;
      return currentUserCache;
    } catch (_) {
      clearSession();
      currentUserCache = null;
      return null;
    }
  }

  function hydrateHomeAuthState(user) {
    if (path !== "index.html" || !user) return;

    const nav = document.querySelector(".nav-links");
    if (nav) {
      nav.querySelectorAll('a[href="login.html"], a[href="signup.html"]').forEach(function (a) {
        a.remove();
      });

      if (!nav.querySelector('a[href="dashboard.html"]')) {
        const dashboardLink = document.createElement("a");
        dashboardLink.href = "dashboard.html";
        dashboardLink.className = "btn btn-primary";
        dashboardLink.textContent = "Dashboard";
        nav.appendChild(dashboardLink);
      }

      if (!nav.querySelector("[data-home-logout]")) {
        const logoutLink = document.createElement("a");
        logoutLink.href = "index.html";
        logoutLink.dataset.homeLogout = "true";
        logoutLink.textContent = "Logout";
        logoutLink.addEventListener("click", function (e) {
          e.preventDefault();
          clearSession();
          currentUserCache = null;
          window.location.href = "index.html";
        });
        nav.appendChild(logoutLink);
      }
    }

    const buttons = document.querySelectorAll(".hero-buttons button");
    if (buttons.length >= 2) {
      const client = isClient(user);
      buttons[0].textContent = client ? "Post a Job" : "Create a Gig";
      buttons[0].onclick = function () {
        window.location.href = client ? "post-job.html" : "create-gig.html";
      };
      buttons[1].textContent = client ? "Go to Dashboard" : "Browse Jobs";
      buttons[1].onclick = function () {
        window.location.href = client ? "dashboard.html" : "browse-jobs.html";
      };
    }

    const heroPill = document.querySelector(".hero-pill");
    if (heroPill) {
      heroPill.textContent = getRole(user) + " account active";
    }
  }

  function bindAuthForms() {
    const next = query.get("next");
    if (next) {
      const authAltLinks = document.querySelectorAll('a[href="signup.html"], a[href="login.html"]');
      authAltLinks.forEach(function (a) {
        const href = a.getAttribute("href");
        a.setAttribute("href", href + "?next=" + encodeURIComponent(next));
      });
    }

    if (path === "signup.html") {
      const form = document.querySelector("form");
      if (!form) return;

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        const data = new FormData(form);
        const firstName = String(data.get("first_name") || "").trim();
        const lastName = String(data.get("last_name") || "").trim();
        const email = String(data.get("email") || "").trim().toLowerCase();
        const password = String(data.get("password") || "");
        const role = String(data.get("role") || "Freelancer");

        if (!firstName || !email || !password) {
          showFormMessage(form, "Please fill all required fields.", true);
          return;
        }

        setFormLoading(form, true, "Creating...");
        try {
          const res = await api("/auth/signup", {
            method: "POST",
            body: { firstName: firstName, lastName: lastName, email: email, password: password, role: role }
          });

          setSession({ email: res.user.email, role: getRole(res.user), token: res.token, loginAt: new Date().toISOString() });
          currentUserCache = res.user;
          if (typeof window.refreshUserDp === "function") window.refreshUserDp();
          showFormMessage(form, getRole(res.user) + " account created. Opening dashboard...", false);
          setTimeout(function () {
            window.location.href = getNextDestination("dashboard.html");
          }, 400);
        } catch (err) {
          showFormMessage(form, err.message, true);
        } finally {
          setFormLoading(form, false);
        }
      });
    }

    if (path === "login.html") {
      const form = document.querySelector("form");
      if (!form) return;

      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        const data = new FormData(form);
        const email = String(data.get("email") || "").trim().toLowerCase();
        const password = String(data.get("password") || "");

        if (!email || !password) {
          showFormMessage(form, "Email and password are required.", true);
          return;
        }

        setFormLoading(form, true, "Logging in...");
        try {
          const res = await api("/auth/login", {
            method: "POST",
            body: { email: email, password: password }
          });

          setSession({ email: res.user.email, role: getRole(res.user), token: res.token, loginAt: new Date().toISOString() });
          currentUserCache = res.user;
          if (typeof window.refreshUserDp === "function") window.refreshUserDp();
          showFormMessage(form, getRole(res.user) + " login successful. Opening dashboard...", false);
          setTimeout(function () {
            window.location.href = getNextDestination("dashboard.html");
          }, 350);
        } catch (err) {
          showFormMessage(form, err.message, true);
        } finally {
          setFormLoading(form, false);
        }
      });
    }

    document.querySelectorAll(".google-btn, .facebook-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        alert("Social login will be added with OAuth backend.");
      });
    });
  }

  async function updateTopbarUser(user) {
    const u = user || (await getCurrentUser());
    if (!u) return;

    const welcome = document.querySelector(".topbar h3");
    if (welcome && /welcome/i.test(welcome.textContent)) {
      welcome.textContent = "Welcome, " + u.firstName + " (" + getRole(u) + ")!";
    }
  }

  function applyRoleDashboardShell(user) {
    if (path !== "dashboard.html" || !user) return;

    const client = isClient(user);
    const roleLabel = document.getElementById("dashboardRoleLabel");
    const heroTitle = document.getElementById("dashboardHeroTitle");
    const heroText = document.getElementById("dashboardHeroText");
    const primaryAction = document.getElementById("dashboardPrimaryAction");
    const secondaryAction = document.getElementById("dashboardSecondaryAction");
    const spotlightTitle = document.getElementById("dashboardSpotlightTitle");
    const spotlightText = document.getElementById("dashboardSpotlightText");
    const statLabels = document.querySelectorAll(".stats .card p");

    if (roleLabel) roleLabel.textContent = client ? "Client Workspace" : "Freelancer Workspace";
    if (heroTitle) heroTitle.textContent = client
      ? "Post projects, review applications, and hire faster."
      : "Build gigs, close projects, and grow repeat clients.";
    if (heroText) heroText.textContent = client
      ? "Track posted jobs, incoming proposals, hiring activity, and project conversations from one place."
      : "Track your live services, proposals, and high-fit opportunities from one control center.";
    if (primaryAction) {
      primaryAction.textContent = client ? "Post Job" : "Create Gig";
      primaryAction.onclick = function () {
        window.location.href = client ? "post-job.html" : "create-gig.html";
      };
    }
    if (secondaryAction) {
      secondaryAction.textContent = client ? "Review Orders" : "Explore Jobs";
      secondaryAction.onclick = function () {
        window.location.href = client ? "orders.html" : "browse-jobs.html";
      };
    }
    if (spotlightTitle) spotlightTitle.textContent = client ? "Clear briefs get better proposals" : "Stay active for faster replies";
    if (spotlightText) spotlightText.textContent = client
      ? "Clients with specific budgets, timelines, and categories attract stronger freelancers."
      : "Freelancers with fresh gigs and recent proposals usually get stronger marketplace visibility.";

    if (statLabels.length >= 3) {
      statLabels[0].textContent = client ? "Open Hires" : "Active Orders";
      statLabels[1].textContent = client ? "Posted Jobs" : "Live Gigs";
      statLabels[2].textContent = client ? "Hiring Budget" : "Potential Earnings";
    }
  }

  async function hydrateProfilePage(user) {
    if (path !== "profile.html") return;
    const u = user || (await getCurrentUser());
    if (!u) return;

    const profile = u.profile || {};
    const h2 = document.querySelector(".profile-card h2");
    const intro = document.querySelector(".profile-card > p");
    const form = document.getElementById("profileEditForm");

    if (h2) h2.textContent = (u.firstName + " " + u.lastName).trim();
    if (intro) intro.textContent = (profile.role || "Freelancer") + " | SkillBridge User";

    if (form) {
      const fullName = form.querySelector('[name="full_name"]');
      const email = form.querySelector('[name="email"]');
      const location = form.querySelector('[name="location"]');
      const skills = form.querySelector('[name="skills"]');
      const about = form.querySelector('[name="about"]');
      const updates = form.querySelector('[name="email_updates"]');

      if (fullName) fullName.value = (u.firstName + " " + u.lastName).trim();
      if (email) email.value = u.email;
      if (location) location.value = profile.location || "India";
      if (skills) skills.value = profile.skills || "HTML, CSS, JavaScript";
      if (about) about.value = profile.about || "Ready to build quality client projects.";
      if (updates) updates.checked = Boolean(profile.emailUpdates);

      if (form.dataset.bound !== "true") {
        form.dataset.bound = "true";
        form.addEventListener("submit", async function (e) {
          e.preventDefault();
          const data = new FormData(form);
          const fullNameValue = String(data.get("full_name") || "").trim();
          const nameParts = fullNameValue.split(/\s+/).filter(Boolean);
          const firstName = nameParts.shift() || u.firstName;
          const lastName = nameParts.join(" ") || "";
          const nextEmail = String(data.get("email") || "").trim().toLowerCase();
          const nextRole = getRole(u);
          const nextLocation = String(data.get("location") || "").trim();
          const nextSkills = String(data.get("skills") || "").trim();
          const nextAbout = String(data.get("about") || "").trim();

          if (!firstName || !nextEmail) {
            showFormMessage(form, "Name and email are required.", true);
            return;
          }

          setFormLoading(form, true, "Saving...");
          try {
            const res = await api("/users/" + encodeURIComponent(u.email), {
              method: "PATCH",
              body: {
                firstName: firstName,
                lastName: lastName,
                email: nextEmail,
                profile: {
                  role: nextRole,
                  location: nextLocation || "India",
                  skills: nextSkills || (nextRole === "Client" ? "Hiring, Project Management" : "HTML, CSS, JavaScript"),
                  about: nextAbout || (nextRole === "Client"
                    ? "Ready to hire skilled freelancers for quality projects."
                    : "Ready to build quality client projects."),
                  emailUpdates: Boolean(data.get("email_updates"))
                }
              }
            });

            const session = getSession() || {};
            setSession({ email: res.user.email, role: getRole(res.user), token: session.token, loginAt: new Date().toISOString() });
            currentUserCache = res.user;
            if (h2) h2.textContent = (res.user.firstName + " " + res.user.lastName).trim();
            if (intro) intro.textContent = getRole(res.user) + " | SkillBridge User";
            if (typeof window.refreshUserDp === "function") window.refreshUserDp();
            showFormMessage(form, "Profile saved successfully.", false);
            applyRoleNavigation(res.user);
            updateTopbarUser(res.user);
          } catch (err) {
            showFormMessage(form, err.message, true);
          } finally {
            setFormLoading(form, false);
          }
        });
      }
    }

    const secondaryAction = document.getElementById("profileRoleAction");
    if (secondaryAction) {
      secondaryAction.textContent = isClient(u) ? "Post Job" : "View My Gigs";
      secondaryAction.onclick = function () {
        window.location.href = isClient(u) ? "post-job.html" : "mygigs.html";
      };
    }
  }

  async function hydrateSettingsPage(user) {
    if (path !== "settings.html") return;
    const u = user || (await getCurrentUser());
    const form = document.querySelector("form");
    if (!u || !form) return;

    const profile = u.profile || {};
    const fullName = form.querySelector('input[name="full_name"]');
    const email = form.querySelector('input[name="email"]');
    const password = form.querySelector('input[name="password"]');
    const updates = form.querySelector('input[name="email_updates"]');

    if (fullName) fullName.value = (u.firstName + " " + u.lastName).trim();
    if (email) email.value = u.email;
    if (password) password.value = "";
    if (updates) updates.checked = Boolean(profile.emailUpdates);

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const data = new FormData(form);
      const newName = String(data.get("full_name") || "").trim();
      const newEmail = String(data.get("email") || "").trim().toLowerCase();
      const newPassword = String(data.get("password") || "");
      const emailUpdates = Boolean(data.get("email_updates"));

      if (!newName || !newEmail) {
        showFormMessage(form, "Name and email are required.", true);
        return;
      }

      const nameParts = newName.split(" ").filter(Boolean);
      const firstName = nameParts[0] || u.firstName;
      const lastName = nameParts.slice(1).join(" ") || u.lastName;

      setFormLoading(form, true, "Saving...");
      try {
        const res = await api("/users/" + encodeURIComponent(u.email), {
          method: "PATCH",
          body: {
            firstName: firstName,
            lastName: lastName,
            email: newEmail,
            password: newPassword || undefined,
            profile: {
              role: profile.role || "Freelancer",
              location: profile.location || "India",
              skills: profile.skills || "HTML, CSS, JavaScript",
              about: profile.about || "Ready to build quality client projects.",
              emailUpdates: emailUpdates
            }
          }
        });

        const session = getSession() || {};
        setSession({ email: res.user.email, role: getRole(res.user), token: session.token, loginAt: new Date().toISOString() });
        currentUserCache = res.user;
        showFormMessage(form, "Settings saved successfully.", false);
        setTimeout(function () {
          window.location.href = "profile.html";
        }, 400);
      } catch (err) {
        showFormMessage(form, err.message, true);
      } finally {
        setFormLoading(form, false);
      }
    });
  }

  async function bindCreateGig(user) {
    if (path !== "create-gig.html") return;
    const u = user || (await getCurrentUser());
    const form = document.querySelector("form");
    if (!u || !form) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const data = new FormData(form);
      const title = String(data.get("title") || "").trim();
      const description = String(data.get("description") || "").trim();
      const price = Number(data.get("price") || 0);
      const deliveryDays = Number(data.get("delivery_days") || 0);

      if (!title || !description || !price || !deliveryDays) {
        showFormMessage(form, "Please fill all fields correctly.", true);
        return;
      }

      setFormLoading(form, true, "Publishing...");
      try {
        await api("/gigs", {
          method: "POST",
          body: {
            title: title,
            description: description,
            price: price,
            deliveryDays: deliveryDays
          }
        });
        showFormMessage(form, "Gig published successfully.", false);
        setTimeout(function () {
          window.location.href = "mygigs.html";
        }, 350);
      } catch (err) {
        showFormMessage(form, err.message, true);
      } finally {
        setFormLoading(form, false);
      }
    });
  }

  async function renderMyGigs(user) {
    if (path !== "mygigs.html") return;
    const u = user || (await getCurrentUser());
    const container = document.querySelector(".gigs-grid");
    if (!u || !container) return;

    try {
      const res = await api("/gigs?ownerEmail=" + encodeURIComponent(u.email));
      const gigs = res.gigs || [];

      if (!gigs.length) {
        container.innerHTML = "<div class=\"gig-card\"><h3>No gigs yet</h3><p>Create your first gig to start receiving projects.</p></div>";
        return;
      }

      container.innerHTML = gigs.map(function (g) {
        return "<div class=\"gig-card\">" +
          "<div class=\"card-badge\">Live Service</div>" +
          "<h3>" + escapeHtml(g.title) + "</h3>" +
          "<p>" + escapeHtml(g.description) + "</p>" +
          "<div class=\"card-meta\">" +
            "<span><strong>Price:</strong> Rs " + Number(g.price).toLocaleString("en-IN") + "</span>" +
            "<span><strong>Delivery:</strong> " + g.deliveryDays + " days</span>" +
          "</div>" +
        "</div>";
      }).join("");
    } catch (err) {
      container.innerHTML = "<div class=\"gig-card\"><h3>Unable to load gigs</h3><p>" + escapeHtml(err.message) + "</p></div>";
    }
  }

  async function bindPostJob(user) {
    if (path !== "post-job.html") return;
    const u = user || (await getCurrentUser());
    const form = document.getElementById("postJobForm") || document.querySelector("form");
    if (!u || !form) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const data = new FormData(form);
      const title = String(data.get("title") || "").trim();
      const description = String(data.get("description") || "").trim();
      const budget = Number(data.get("budget") || 0);
      const category = String(data.get("category") || "").trim();
      const deadlineDays = Number(data.get("deadline_days") || 0);

      if (!title || !description || !budget || !category || !deadlineDays) {
        showFormMessage(form, "Please fill all fields correctly.", true);
        return;
      }

      setFormLoading(form, true, "Posting...");
      try {
        await api("/jobs", {
          method: "POST",
          body: {
            title: title,
            description: description,
            category: category,
            budget: budget,
            deadlineDays: deadlineDays
          }
        });
        showFormMessage(form, "Job posted successfully.", false);
        setTimeout(function () {
          window.location.href = "browse-jobs.html";
        }, 350);
      } catch (err) {
        showFormMessage(form, err.message, true);
      } finally {
        setFormLoading(form, false);
      }
    });
  }

  async function renderBrowseJobs(user) {
    if (path !== "browse-jobs.html") return;
    const u = user || (await getCurrentUser());
    const container = document.getElementById("jobsList");
    if (!u || !container) return;

    const categoryFilter = (query.get("category") || "").trim();

    try {
      const endpoint = categoryFilter
        ? "/jobs?category=" + encodeURIComponent(categoryFilter)
        : "/jobs";

      const [jobsRes, ordersRes] = await Promise.all([
        api(endpoint),
        api("/orders")
      ]);

      const jobs = jobsRes.jobs || [];
      const apps = (ordersRes.orders && ordersRes.orders.myApplications) || [];

      if (categoryFilter) {
        const title = document.querySelector(".profile-card h2");
        if (title) title.textContent = "Available Jobs - " + categoryFilter;
      }

      if (!jobs.length) {
        container.innerHTML = "<div class=\"gig-card\"><h3>No jobs found</h3><p>Try another category or check again later.</p></div>";
        return;
      }

      container.innerHTML = jobs.map(function (job) {
        const alreadyApplied = apps.some(function (a) { return a.jobId === job.id; });
        const ownJob = job.ownerEmail === u.email;
        const buttonText = ownJob ? "Your Job" : (alreadyApplied ? "Applied" : "Apply");
        const disabled = ownJob || alreadyApplied ? "disabled" : "";

        return "<div class=\"gig-card\">" +
          "<div class=\"card-badge\">Open Project</div>" +
          "<h3>" + escapeHtml(job.title) + "</h3>" +
          "<p>" + escapeHtml(job.description) + "</p>" +
          "<div class=\"card-meta\">" +
            "<span><strong>Category:</strong> " + escapeHtml(job.category) + "</span>" +
            "<span><strong>Budget:</strong> Rs " + Number(job.budget).toLocaleString("en-IN") + "</span>" +
            "<span><strong>Deadline:</strong> " + job.deadlineDays + " days</span>" +
          "</div>" +
          "<div class=\"actions\" style=\"margin-top: 12px;\">" +
            "<a class=\"secondary-btn action-link\" href=\"job-details.html?jobId=" + encodeURIComponent(job.id) + "\">View Details</a>" +
            "<button type=\"button\" data-apply-job=\"" + job.id + "\" " + disabled + ">" + buttonText + "</button>" +
          "</div>" +
        "</div>";
      }).join("");

      container.querySelectorAll("button[data-apply-job]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          const jobId = btn.getAttribute("data-apply-job");
          try {
            btn.disabled = true;
            btn.textContent = "Applying...";
            await api("/jobs/" + encodeURIComponent(jobId) + "/apply", {
              method: "POST"
            });
            renderBrowseJobs(u);
          } catch (err) {
            alert(err.message);
            btn.disabled = false;
            btn.textContent = "Apply";
          }
        });
      });
    } catch (err) {
      container.innerHTML = "<div class=\"gig-card\"><h3>Unable to load jobs</h3><p>" + escapeHtml(err.message) + "</p></div>";
    }
  }

  async function renderOrdersPage(user) {
    if (path !== "orders.html") return;
    const u = user || (await getCurrentUser());
    const container = document.querySelector(".profile-details");
    if (!u || !container) return;

    try {
      const res = await api("/orders");
      const orders = res.orders || {};
      const postedJobs = orders.postedJobs || [];
      const incoming = orders.incomingApplications || [];
      const myApps = orders.myApplications || [];

      const cards = [];
      cards.push("<div class=\"order-summary\"><strong>Jobs You Posted</strong><p>" + (postedJobs.length ? postedJobs.length + " active jobs in your pipeline" : "No jobs posted yet") + "</p></div>");

      if (!incoming.length) {
        cards.push("<div><strong>Applications On Your Jobs</strong><p>No applications received yet.</p></div>");
      } else {
        incoming.forEach(function (item) {
          if (!item.job) return;
          cards.push(
            "<div>" +
              "<div class=\"card-badge\">Client View</div>" +
              "<strong>" + escapeHtml(item.job.title) + "</strong>" +
              "<p>Freelancer: " + escapeHtml(item.freelancerEmail) + "</p>" +
              "<p>Status: " + escapeHtml(item.status) + "</p>" +
              "<div class=\"actions\" style=\"margin-top: 8px;\">" +
                (item.status === "Accepted"
                  ? "<a class=\"secondary-btn action-link\" href=\"messages.html?applicationId=" + encodeURIComponent(item.id) + "\">Chat</a>"
                  : "<button type=\"button\" data-app-action=\"Accepted\" data-app-id=\"" + item.id + "\">Accept</button>" +
                    "<button type=\"button\" class=\"secondary-btn\" data-app-action=\"Rejected\" data-app-id=\"" + item.id + "\">Reject</button>") +
              "</div>" +
            "</div>"
          );
        });
      }

      if (!myApps.length) {
        cards.push("<div><strong>Your Applications</strong><p>You have not applied to any job yet.</p></div>");
      } else {
        myApps.forEach(function (item) {
          if (!item.job) return;
          cards.push(
            "<div>" +
              "<div class=\"card-badge\">Freelancer View</div>" +
              "<strong>Applied: " + escapeHtml(item.job.title) + "</strong>" +
              "<p>Client: " + escapeHtml(item.clientEmail) + "</p>" +
              "<p>Status: " + escapeHtml(item.status) + "</p>" +
              (item.status === "Accepted"
                ? "<div class=\"actions\" style=\"margin-top: 8px;\"><a class=\"secondary-btn action-link\" href=\"messages.html?applicationId=" + encodeURIComponent(item.id) + "\">Chat with Client</a></div>"
                : "") +
            "</div>"
          );
        });
      }

      container.innerHTML = cards.join("");

      container.querySelectorAll("button[data-app-action]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          const appId = btn.getAttribute("data-app-id");
          const status = btn.getAttribute("data-app-action");
          btn.disabled = true;
          const oldText = btn.textContent;
          btn.textContent = "Updating...";

          try {
            await api("/applications/" + encodeURIComponent(appId), {
              method: "PATCH",
              body: { status: status }
            });
            renderOrdersPage(u);
          } catch (err) {
            alert(err.message);
            btn.disabled = false;
            btn.textContent = oldText;
          }
        });
      });
    } catch (err) {
      container.innerHTML = "<div><strong>Unable to load orders</strong><p>" + escapeHtml(err.message) + "</p></div>";
    }
  }

  async function updateDashboardStats(user) {
    if (path !== "dashboard.html") return;
    const u = user || (await getCurrentUser());
    if (!u) return;

    const cards = document.querySelectorAll(".stats .card h3");
    if (cards.length < 3) return;

    try {
      const [gigsRes, jobsRes, ordersRes] = await Promise.all([
        api("/gigs?ownerEmail=" + encodeURIComponent(u.email)),
        api("/jobs?ownerEmail=" + encodeURIComponent(u.email)),
        api("/orders")
      ]);

      const gigs = gigsRes.gigs || [];
      const jobs = jobsRes.jobs || [];
      const incoming = (ordersRes.orders && ordersRes.orders.incomingApplications) || [];
      const myApps = (ordersRes.orders && ordersRes.orders.myApplications) || [];

      const acceptedAsFreelancer = myApps.filter(function (a) { return a.status === "Accepted"; });
      const acceptedAsClient = incoming.filter(function (a) { return a.status === "Accepted"; });

      const earningsFromJobs = acceptedAsFreelancer.reduce(function (sum, a) {
        const budget = a.job ? Number(a.job.budget || 0) : 0;
        return sum + budget;
      }, 0);

      const earningsFromGigs = gigs.reduce(function (sum, g) {
        return sum + Number(g.price || 0);
      }, 0);

      if (isClient(u)) {
        const hiringBudget = jobs.reduce(function (sum, job) {
          return sum + Number(job.budget || 0);
        }, 0);
        cards[0].textContent = String(acceptedAsClient.length || 0);
        cards[1].textContent = String(jobs.length || 0);
        cards[2].textContent = "Rs " + Number(hiringBudget).toLocaleString("en-IN");
      } else {
        cards[0].textContent = String(acceptedAsFreelancer.length || 0);
        cards[1].textContent = String(gigs.length || 0);
        cards[2].textContent = "Rs " + Number(earningsFromJobs + earningsFromGigs).toLocaleString("en-IN");
      }
    } catch (_) {
      cards[0].textContent = "0";
      cards[1].textContent = "0";
      cards[2].textContent = "Rs 0";
    }
  }

  async function renderDashboardPanels(user) {
    if (path !== "dashboard.html") return;
    const u = user || (await getCurrentUser());
    if (!u) return;

    const summaryNode = document.getElementById("dashboardSummary");
    const activityNode = document.getElementById("dashboardActivity");
    const discoverNode = document.getElementById("dashboardDiscover");

    if (!summaryNode || !activityNode || !discoverNode) return;

    try {
      const [gigsRes, jobsRes, ordersRes] = await Promise.all([
        api("/gigs?ownerEmail=" + encodeURIComponent(u.email)),
        api("/jobs"),
        api("/orders")
      ]);

      const gigs = gigsRes.gigs || [];
      const jobs = jobsRes.jobs || [];
      const orders = ordersRes.orders || {};
      const incoming = orders.incomingApplications || [];
      const myApps = orders.myApplications || [];
      const client = isClient(u);
      const postedJobs = jobs.filter(function (job) {
        return job.ownerEmail === u.email;
      });

      if (client) {
        summaryNode.innerHTML =
          "<div class=\"highlight-card\">" +
            "<p class=\"eyebrow\">Account Type</p>" +
            "<h3>Client</h3>" +
            "<p>Hiring dashboard for posting work and reviewing freelancer applications.</p>" +
          "</div>" +
          "<div class=\"highlight-card\">" +
            "<p class=\"eyebrow\">Posted Jobs</p>" +
            "<h3>" + postedJobs.length + " jobs live</h3>" +
            "<p>Open project briefs help freelancers understand your requirements.</p>" +
          "</div>" +
          "<div class=\"highlight-card\">" +
            "<p class=\"eyebrow\">Applications</p>" +
            "<h3>" + incoming.length + " received</h3>" +
            "<p>Review, accept, or reject applications from Orders.</p>" +
          "</div>";
      } else {
        summaryNode.innerHTML =
          "<div class=\"highlight-card\">" +
            "<p class=\"eyebrow\">Account Type</p>" +
            "<h3>Freelancer</h3>" +
            "<p>" + escapeHtml((u.profile && u.profile.skills) || "Add skills in settings") + "</p>" +
          "</div>" +
          "<div class=\"highlight-card\">" +
            "<p class=\"eyebrow\">Service Count</p>" +
            "<h3>" + gigs.length + " gigs live</h3>" +
            "<p>Keep your packages active to rank better in search.</p>" +
          "</div>" +
          "<div class=\"highlight-card\">" +
            "<p class=\"eyebrow\">Proposal Pulse</p>" +
            "<h3>" + myApps.length + " proposals</h3>" +
            "<p>Track where your applications stand across open projects.</p>" +
          "</div>";
      }

      const featuredJobs = jobs.filter(function (job) {
        return job.ownerEmail !== u.email;
      }).slice(0, 3);

      if (client) {
        if (!postedJobs.length) {
          discoverNode.innerHTML = "<div class=\"activity-card\"><strong>No jobs posted yet</strong><p>Post your first job to start receiving freelancer applications.</p><div class=\"actions\"><a class=\"secondary-btn action-link\" href=\"post-job.html\">Post Job</a></div></div>";
        } else {
          discoverNode.innerHTML = postedJobs.slice(0, 3).map(function (job) {
            return "<a class=\"activity-card link-card\" href=\"job-details.html?jobId=" + encodeURIComponent(job.id) + "\">" +
              "<span class=\"eyebrow\">Your Project</span>" +
              "<strong>" + escapeHtml(job.title) + "</strong>" +
              "<p>Budget: Rs " + Number(job.budget).toLocaleString("en-IN") + " • " + job.deadlineDays + " day deadline</p>" +
            "</a>";
          }).join("");
        }
      } else if (!featuredJobs.length) {
        discoverNode.innerHTML = "<div class=\"activity-card\"><strong>No opportunities yet</strong><p>Create a gig now and check Browse Jobs again later.</p></div>";
      } else {
        discoverNode.innerHTML = featuredJobs.map(function (job) {
          return "<a class=\"activity-card link-card\" href=\"job-details.html?jobId=" + encodeURIComponent(job.id) + "\">" +
            "<span class=\"eyebrow\">" + escapeHtml(job.category) + "</span>" +
            "<strong>" + escapeHtml(job.title) + "</strong>" +
            "<p>Budget: Rs " + Number(job.budget).toLocaleString("en-IN") + " • " + job.deadlineDays + " day turnaround</p>" +
          "</a>";
        }).join("");
      }

      const activityItems = [];
      incoming.slice(0, 2).forEach(function (item) {
        if (!item.job) return;
        activityItems.push(
          "<div class=\"activity-card\">" +
            "<span class=\"eyebrow\">New Application</span>" +
            "<strong>" + escapeHtml(item.freelancerEmail) + "</strong>" +
            "<p>Applied to " + escapeHtml(item.job.title) + " with status " + escapeHtml(item.status) + ".</p>" +
          "</div>"
        );
      });

      myApps.slice(0, 2).forEach(function (item) {
        if (!item.job) return;
        activityItems.push(
          "<div class=\"activity-card\">" +
            "<span class=\"eyebrow\">Proposal Tracker</span>" +
            "<strong>" + escapeHtml(item.job.title) + "</strong>" +
            "<p>Your proposal is currently " + escapeHtml(item.status) + ".</p>" +
          "</div>"
        );
      });

      if (!activityItems.length) {
        activityItems.push(client
          ? "<div class=\"activity-card\"><span class=\"eyebrow\">Fresh Start</span><strong>No recent hiring activity</strong><p>Post a job to start receiving applications from freelancers.</p></div>"
          : "<div class=\"activity-card\"><span class=\"eyebrow\">Fresh Start</span><strong>No recent activity</strong><p>Create a gig or apply to a job to start building momentum.</p></div>");
      }

      activityNode.innerHTML = activityItems.join("");
    } catch (err) {
      summaryNode.innerHTML = "<div class=\"activity-card\"><strong>Dashboard unavailable</strong><p>" + escapeHtml(err.message) + "</p></div>";
      activityNode.innerHTML = "";
      discoverNode.innerHTML = "";
    }
  }

  async function renderMessagesPage(user) {
    if (path !== "messages.html") return;
    const u = user || (await getCurrentUser());
    const container = document.getElementById("messagesList");
    const composer = document.getElementById("messageComposer");
    if (!u || !container || !composer) return;

    try {
      const [ordersRes, messagesRes] = await Promise.all([
        api("/orders"),
        api("/messages")
      ]);

      const orders = ordersRes.orders || {};
      const incoming = orders.incomingApplications || [];
      const myApps = orders.myApplications || [];
      const messages = messagesRes.messages || [];

      const chats = [];
      incoming.concat(myApps).forEach(function (item) {
        if (!item.job || item.status !== "Accepted") return;
        const clientSide = item.clientEmail === u.email;
        chats.push({
          id: item.id,
          jobId: item.jobId,
          title: item.job.title,
          counterpart: clientSide ? item.freelancerEmail : item.clientEmail,
          label: clientSide ? "Freelancer chat" : "Client chat",
          acceptedAt: item.appliedAt
        });
      });

      const requestedApplicationId = query.get("applicationId");

      if (!chats.length) {
        container.innerHTML = "<div class=\"message-item\"><h4>Chat locked</h4><p>Project chat unlocks after a client accepts a freelancer application.</p><span>Accept an application first, then both sides can talk here.</span></div>";
        composer.querySelectorAll("select, textarea, input, button").forEach(function (node) {
          node.disabled = true;
        });
      } else {
        container.innerHTML = chats.map(function (chat) {
          const chatMessages = messages.filter(function (message) {
            const sameApp = message.applicationId && message.applicationId === chat.id;
            const samePeople = (message.senderEmail === u.email && message.recipientEmail === chat.counterpart)
              || (message.senderEmail === chat.counterpart && message.recipientEmail === u.email);
            return sameApp || (samePeople && message.subject === chat.title);
          }).sort(function (a, b) {
            return new Date(a.createdAt) - new Date(b.createdAt);
          });

          const messageHtml = chatMessages.length
            ? chatMessages.map(function (message) {
                const mine = message.senderEmail === u.email;
                const attachment = message.attachment;
                const attachmentHtml = attachment
                  ? "<button type=\"button\" class=\"file-download\" data-file-url=\"" + escapeHtml(attachment.downloadUrl) + "\" data-file-name=\"" + escapeHtml(attachment.fileName) + "\">" +
                      "Download " + escapeHtml(attachment.fileName) + " (" + formatFileSize(attachment.fileSize) + ")" +
                    "</button>"
                  : "";
                return "<div class=\"chat-bubble " + (mine ? "mine" : "theirs") + "\">" +
                  "<strong>" + (mine ? "You" : escapeHtml(chat.counterpart)) + "</strong>" +
                  (message.body ? "<p>" + escapeHtml(message.body) + "</p>" : "") +
                  attachmentHtml +
                  "<span>" + formatRelativeDate(message.createdAt) + "</span>" +
                "</div>";
              }).join("")
            : "<p class=\"muted-line\">No messages yet. Start the project conversation below.</p>";

          return "<div class=\"message-item\">" +
            "<div class=\"card-badge\">" + escapeHtml(chat.label) + "</div>" +
            "<h4>" + escapeHtml(chat.title) + "</h4>" +
            "<p>Chat with " + escapeHtml(chat.counterpart) + "</p>" +
            "<div class=\"chat-thread\">" + messageHtml + "</div>" +
          "</div>";
        }).join("");

        container.querySelectorAll("button[data-file-url]").forEach(function (btn) {
          btn.addEventListener("click", async function () {
            const oldText = btn.textContent;
            btn.disabled = true;
            btn.textContent = "Downloading...";
            try {
              await downloadFile(btn.getAttribute("data-file-url"), btn.getAttribute("data-file-name"));
            } catch (err) {
              alert(err.message);
            } finally {
              btn.disabled = false;
              btn.textContent = oldText;
            }
          });
        });
      }

      const chatSelect = composer.querySelector('select[name="application_id"]');
      if (chatSelect && chats.length) {
        composer._skillBridgeChats = chats;
        composer.querySelectorAll("select, textarea, input, button").forEach(function (node) {
          node.disabled = false;
        });
        chatSelect.disabled = false;
        chatSelect.innerHTML = chats.map(function (chat) {
          return "<option value=\"" + escapeHtml(chat.id) + "\">" +
            escapeHtml(chat.title + " - " + chat.counterpart) +
          "</option>";
        }).join("");
        if (requestedApplicationId && chats.some(function (chat) { return chat.id === requestedApplicationId; })) {
          chatSelect.value = requestedApplicationId;
        }
      }

      if (composer.dataset.bound !== "true") {
        composer.dataset.bound = "true";
        composer.addEventListener("submit", async function (e) {
          e.preventDefault();
          const data = new FormData(composer);
          const applicationId = String(data.get("application_id") || "").trim();
          const message = String(data.get("message") || "").trim();
          const fileInput = composer.querySelector('input[name="attachment"]');
          const file = fileInput && fileInput.files ? fileInput.files[0] : null;
          const currentChats = composer._skillBridgeChats || chats;
          const chat = currentChats.find(function (item) { return item.id === applicationId; });

          if (!chat || (!message && !file)) {
            showFormMessage(composer, "Choose an accepted project and write a message or attach a file.", true);
            return;
          }

          setFormLoading(composer, true, "Sending...");
          try {
            const attachment = await makeAttachment(file);
            await api("/messages", {
              method: "POST",
              body: {
                recipientEmail: chat.counterpart,
                applicationId: chat.id,
                subject: chat.title,
                body: message,
                attachment: attachment
              }
            });
            showFormMessage(composer, attachment ? "File sent successfully." : "Message sent successfully.", false);
            composer.reset();
            renderMessagesPage(u);
          } catch (err) {
            showFormMessage(composer, err.message, true);
          } finally {
            setFormLoading(composer, false);
          }
        });
      }
    } catch (err) {
      container.innerHTML = "<div class=\"message-item\"><h4>Unable to load messages</h4><p>" + escapeHtml(err.message) + "</p></div>";
    }
  }

  async function renderNotificationsPage(user) {
    if (path !== "notifications.html") return;
    const u = user || (await getCurrentUser());
    const container = document.getElementById("notificationsList");
    const markAll = document.getElementById("markAllRead");
    if (!u || !container) return;

    const storageKey = "sb_notifications_seen_" + u.email;

    try {
      const res = await api("/orders");
      const orders = res.orders || {};
      const incoming = orders.incomingApplications || [];
      const myApps = orders.myApplications || [];
      const postedJobs = orders.postedJobs || [];

      const notifications = [];

      postedJobs.slice(0, 2).forEach(function (job) {
        notifications.push({
          title: "Job live in marketplace",
          message: job.title + " is active and visible to freelancers.",
          createdAt: job.createdAt || new Date().toISOString()
        });
      });

      incoming.slice(0, 3).forEach(function (item) {
        if (!item.job) return;
        notifications.push({
          title: "New application received",
          message: item.freelancerEmail + " applied to " + item.job.title + ".",
          createdAt: item.appliedAt
        });
      });

      myApps.slice(0, 3).forEach(function (item) {
        if (!item.job) return;
        notifications.push({
          title: "Proposal update",
          message: "Your application for " + item.job.title + " is " + item.status + ".",
          createdAt: item.appliedAt
        });
      });

      if (!notifications.length) {
        container.innerHTML = "<div><strong>No notifications yet</strong><p>Activity alerts will appear here after you apply to jobs or receive applications.</p></div>";
      } else {
        const seen = localStorage.getItem(storageKey) === "true";
        container.innerHTML = notifications.sort(function (a, b) {
          return new Date(b.createdAt) - new Date(a.createdAt);
        }).map(function (item) {
          return "<div class=\"" + (seen ? "" : "unread-card") + "\">" +
            "<strong>" + escapeHtml(item.title) + "</strong>" +
            "<p>" + escapeHtml(item.message) + "</p>" +
            "<p class=\"muted-line\">" + formatRelativeDate(item.createdAt) + "</p>" +
          "</div>";
        }).join("");
      }

      if (markAll && markAll.dataset.bound !== "true") {
        markAll.dataset.bound = "true";
        markAll.addEventListener("click", function () {
          localStorage.setItem(storageKey, "true");
          renderNotificationsPage(u);
        });
      }
    } catch (err) {
      container.innerHTML = "<div><strong>Unable to load notifications</strong><p>" + escapeHtml(err.message) + "</p></div>";
    }
  }

  async function renderJobDetailsPage(user) {
    if (path !== "job-details.html") return;
    const u = user || (await getCurrentUser());
    const titleNode = document.getElementById("jobTitle");
    const metaNode = document.getElementById("jobMeta");
    const descriptionNode = document.getElementById("jobDescription");
    const applyBtn = document.getElementById("jobApplyButton");
    const statusNode = document.getElementById("jobStatus");
    if (!u || !titleNode || !metaNode || !descriptionNode || !applyBtn || !statusNode) return;

    try {
      const [jobsRes, ordersRes] = await Promise.all([
        api("/jobs"),
        api("/orders")
      ]);

      const jobs = jobsRes.jobs || [];
      const requestedId = query.get("jobId");
      const job = jobs.find(function (item) { return item.id === requestedId; }) || jobs[0];

      if (!job) {
        titleNode.textContent = "No job available";
        metaNode.innerHTML = "<p>No open jobs were found.</p>";
        descriptionNode.textContent = "Return to Browse Jobs and try again later.";
        applyBtn.style.display = "none";
        return;
      }

      const myApps = (ordersRes.orders && ordersRes.orders.myApplications) || [];
      const existingApp = myApps.find(function (item) { return item.jobId === job.id; });
      const ownJob = job.ownerEmail === u.email;

      titleNode.textContent = job.title;
      metaNode.innerHTML =
        "<div class=\"detail-chip\">Budget: Rs " + Number(job.budget).toLocaleString("en-IN") + "</div>" +
        "<div class=\"detail-chip\">Category: " + escapeHtml(job.category) + "</div>" +
        "<div class=\"detail-chip\">Deadline: " + job.deadlineDays + " days</div>" +
        "<div class=\"detail-chip\">Client: " + escapeHtml(job.ownerEmail) + "</div>";
      descriptionNode.textContent = job.description;

      if (ownJob) {
        statusNode.textContent = "You posted this job.";
        applyBtn.textContent = "View Orders";
        applyBtn.onclick = function () {
          window.location.href = "orders.html";
        };
      } else if (existingApp) {
        statusNode.textContent = "You already applied. Current status: " + existingApp.status;
        applyBtn.disabled = true;
        applyBtn.textContent = "Applied";
      } else {
        statusNode.textContent = "This project is open for applications.";
        applyBtn.disabled = false;
        applyBtn.textContent = "Apply Now";
        applyBtn.onclick = async function () {
          applyBtn.disabled = true;
          applyBtn.textContent = "Applying...";
          try {
            await api("/jobs/" + encodeURIComponent(job.id) + "/apply", {
              method: "POST"
            });
            statusNode.textContent = "Application submitted successfully.";
            applyBtn.textContent = "Applied";
          } catch (err) {
            statusNode.textContent = err.message;
            applyBtn.disabled = false;
            applyBtn.textContent = "Apply Now";
          }
        };
      }
    } catch (err) {
      titleNode.textContent = "Unable to load job";
      descriptionNode.textContent = err.message;
      applyBtn.style.display = "none";
    }
  }

  function bindHelpForm() {
    if (path !== "help.html") return;
    const form = document.querySelector(".profile-card form");
    if (!form) return;

    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const data = new FormData(form);
      const name = String(data.get("name") || "").trim();
      const email = String(data.get("email") || "").trim();
      const message = String(data.get("message") || "").trim();

      if (!name || !email || !message) {
        showFormMessage(form, "Please complete all fields.", true);
        return;
      }

      setFormLoading(form, true, "Sending...");
      try {
        await api("/support", {
          method: "POST",
          body: { name: name, email: email, message: message }
        });
        showFormMessage(form, "Message sent successfully. Our team will contact you soon.", false);
        form.reset();
      } catch (err) {
        showFormMessage(form, err.message, true);
      } finally {
        setFormLoading(form, false);
      }
    });
  }

  function formatRelativeDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Recently";

    const diff = Date.now() - date.getTime();
    const minutes = Math.round(diff / 60000);
    if (minutes < 60) return minutes <= 1 ? "Just now" : minutes + " minutes ago";
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours + " hours ago";
    const days = Math.round(hours / 24);
    return days + " days ago";
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  document.addEventListener("DOMContentLoaded", async function () {
    bindThemeToggle();
    ensureProtectedRoute();
    bindSidebarLogo();
    bindLogout();
    markActiveSidebar();
    bindAuthForms();

    const user = await getCurrentUser();
    await updateTopbarUser(user);
    hydrateHomeAuthState(user);
    applyRoleNavigation(user);
    applyRoleDashboardShell(user);
    await hydrateProfilePage(user);
    await hydrateSettingsPage(user);
    await bindCreateGig(user);
    await renderMyGigs(user);
    await bindPostJob(user);
    await renderBrowseJobs(user);
    await renderOrdersPage(user);
    await updateDashboardStats(user);
    await renderDashboardPanels(user);
    await renderMessagesPage(user);
    await renderNotificationsPage(user);
    await renderJobDetailsPage(user);
    bindHelpForm();
  });
})();
