import {
    ArrowLeftRight,
    BarChart3,
    Bell,
    ClipboardList,
    Package,
    ScrollText,
    ShoppingCart,
    Truck,
    Users,
    Warehouse
} from "lucide-react";

// What the system does — shared by the Home and Features pages,
// so both always describe the same modules
export const MODULES = [
    {
        icon: Package,
        title: "Product catalog",
        summary: "SKUs, barcodes, prices, tax and categories in one clean catalog.",
        details: ["Unique SKU and barcode checks", "Price and tax per product", "Search and filter by brand, category and price"]
    },
    {
        icon: Warehouse,
        title: "Multiple warehouses",
        summary: "Separate stock for every location, with capacity and a named manager.",
        details: ["Stock per product per warehouse", "Capacity limits enforced", "Warehouse utilisation at a glance"]
    },
    {
        icon: ClipboardList,
        title: "Live inventory",
        summary: "Stock-in, stock-out, reserved and available — always accurate.",
        details: ["Reserved stock can't be sold twice", "Full movement history", "Low-stock alerts at your reorder level"]
    },
    {
        icon: ArrowLeftRight,
        title: "Stock transfers",
        summary: "Move stock between warehouses with approval, dispatch and receipt.",
        details: ["Manager approval", "Goods in transit tracked", "Every movement recorded"]
    },
    {
        icon: ShoppingCart,
        title: "Customer orders",
        summary: "Take orders, reserve stock instantly, then pick, pack and ship.",
        details: ["Prices and tax calculated for you", "Stock reserved on confirmation", "Tracking number and delivery timeline"]
    },
    {
        icon: Truck,
        title: "Suppliers & purchasing",
        summary: "Purchase requests, approvals, supplier confirmation and partial deliveries.",
        details: ["Approval before spending", "Supplier portal for confirmations", "Receive goods in several deliveries"]
    },
    {
        icon: BarChart3,
        title: "Reports & analytics",
        summary: "Revenue, stock value, supplier performance and best sellers.",
        details: ["Dashboard with key numbers", "Monthly trends", "Low stock with quantities already on order"]
    },
    {
        icon: Bell,
        title: "Notifications",
        summary: "The right people hear about low stock, approvals and shipments.",
        details: ["Personal inbox for every user", "Unread count in the header", "Only what concerns you"]
    },
    {
        icon: ScrollText,
        title: "Audit trail",
        summary: "Who changed what, and when — kept permanently.",
        details: ["Before-and-after values", "Search by person, record or date", "Records can't be edited or deleted"]
    }
];

// Who uses the system and what they can do (matches the backend's permissions)
export const ROLE_DESCRIPTIONS = [
    {
        icon: Users,
        title: "Administrator",
        text: "Manages users and roles, the catalog and settings; sees every report and the audit trail."
    },
    {
        icon: Warehouse,
        title: "Inventory manager",
        text: "Runs warehouses, stock-in and stock-out, transfers, suppliers and purchasing; views reports."
    },
    {
        icon: ShoppingCart,
        title: "Store staff",
        text: "Checks stock, creates customer orders, and picks, packs and ships them."
    },
    {
        icon: Truck,
        title: "Supplier",
        text: "Sees only their own purchase orders, confirms them and shares delivery updates."
    }
];
