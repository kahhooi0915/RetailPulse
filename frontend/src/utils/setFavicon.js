export default function setFavicon(role) {
    document
        .querySelectorAll("link[rel='icon'], link[rel='shortcut icon'], link[rel='apple-touch-icon']")
        .forEach((icon) => icon.remove());

    const link = document.createElement("link");
    link.rel = "icon";
    link.type = "image/png";

    if (role === "SYSTEM_ADMIN") {
        link.href = "/admin.png?v=admin2";
    } else if (role === "INVENTORY_MANAGER") {
        link.href = "/manager.png?v=manager2";
    } else if (role === "BRANCH_STAFF") {
        link.href = "/cashier.png?v=staff2";
    } else {
        link.href = "/favicon.png?v=default2";
    }

    document.head.appendChild(link);
}