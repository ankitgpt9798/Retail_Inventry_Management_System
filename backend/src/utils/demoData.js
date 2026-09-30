// Fixed lists used by the demo seed (npm run seed → utils/seedDemo.js).
// All companies, brands, people, emails and phone numbers are FICTIONAL.
// Emails use the reserved ".example" domain so no real inbox can ever receive anything.

// People who log in. Existing accounts (same email) are kept as they are — including their password.
// The password below is only used when the account doesn't exist yet.
const DEMO_USERS = [
    { key: "ravi", name: "Ravi Kumar", email: "ravi@shop.com", role: "INVENTORY_MANAGER", password: "Ravi67890" },
    { key: "kavya", name: "Kavya Nair", email: "kavya@shop.com", role: "INVENTORY_MANAGER", password: "Demo12345" },
    { key: "arjun", name: "Arjun Mehta", email: "arjun@shop.com", role: "INVENTORY_MANAGER", password: "Demo12345" },
    { key: "sunita", name: "Sunita Sharma", email: "sunita@shop.com", role: "STAFF", password: "Staff1234" },
    { key: "rahul", name: "Rahul Verma", email: "rahul@shop.com", role: "STAFF", password: "Demo12345" },
    { key: "neha", name: "Neha Singh", email: "neha@shop.com", role: "STAFF", password: "Demo12345" },
    // Supplier portal login for Acme Electronics (linked after the suppliers are created)
    { key: "suresh", name: "Suresh Patel", email: "suresh@acme-electronics.in", role: "SUPPLIER", password: "Supplier123", supplier: "Acme Electronics Pvt Ltd" }
];

const CATEGORIES = [
    { name: "Grocery", description: "Rice, flour, pulses, oils and other kitchen staples", prefix: "GRO", taxRate: 5, reorderLevel: 40 },
    { name: "Electronics", description: "Computer accessories, chargers and audio", prefix: "ELE", taxRate: 18, reorderLevel: 15 },
    { name: "Stationery", description: "Paper, pens, notebooks and office basics", prefix: "STA", taxRate: 12, reorderLevel: 30 },
    { name: "Home & Kitchen", description: "Cookware, bottles and storage", prefix: "HOM", taxRate: 18, reorderLevel: 12 },
    { name: "Personal Care", description: "Shampoo, soap, skin and oral care", prefix: "PER", taxRate: 18, reorderLevel: 25 },
    { name: "Beverages", description: "Tea, coffee, juices and water", prefix: "BEV", taxRate: 12, reorderLevel: 30 },
    { name: "Snacks", description: "Chips, biscuits, namkeen and chocolate", prefix: "SNK", taxRate: 12, reorderLevel: 40 },
    { name: "Cleaning", description: "Household cleaning and laundry", prefix: "CLN", taxRate: 18, reorderLevel: 20 },
    { name: "Clothing", description: "Everyday cotton and denim wear", prefix: "CLO", taxRate: 12, reorderLevel: 10 },
    { name: "Accessories", description: "Bags, wallets, watches and phone covers", prefix: "ACC", taxRate: 18, reorderLevel: 10 }
];

// [name, brand, costPrice, sellingPrice, status?] — 5 per category, in the same order as CATEGORIES.
// SKUs are generated from the category prefix: GRO-101, GRO-102, …
const PRODUCTS = {
    Grocery: [
        ["Basmati Rice 5 kg", "GreenHarvest", 520, 649],
        ["Whole Wheat Atta 10 kg", "GreenHarvest", 380, 465],
        ["Toor Dal 1 kg", "Desi Pantry", 118, 149],
        ["Sunflower Oil 1 L", "GoldenDrop", 128, 159],
        ["Iodised Salt 1 kg", "Desi Pantry", 18, 25]
    ],
    Electronics: [
        ["Wireless Optical Mouse", "Voltix", 420, 699],
        ["Mechanical Keyboard", "Voltix", 1650, 2499],
        ["24-inch LED Monitor", "Nimbus", 7800, 10499],
        ["USB-C Fast Charger 65 W", "ChargeUp", 850, 1399],
        ["Bluetooth Earbuds", "Nimbus", 1100, 1799]
    ],
    Stationery: [
        ["A4 Copier Paper (500 sheets)", "PaperTrail", 240, 320],
        ["Gel Pen Pack of 10", "InkWell", 65, 110],
        ["Spiral Notebook 200 pages", "PaperTrail", 48, 80],
        ["Stapler with 1000 Pins", "DeskPro", 110, 180],
        ["Highlighter Set (5 colours)", "InkWell", 75, 130, "INACTIVE"]
    ],
    "Home & Kitchen": [
        ["Non-stick Frying Pan 26 cm", "HomeNest", 540, 899],
        ["Steel Water Bottle 1 L", "HydraPure", 260, 449],
        ["Glass Storage Jar Set of 3", "HomeNest", 380, 649],
        ["Pressure Cooker 5 L", "CookRight", 1350, 2099],
        ["Bamboo Chopping Board", "HomeNest", 180, 299]
    ],
    "Personal Care": [
        ["Herbal Shampoo 340 ml", "PureCare", 145, 220],
        ["Aloe Vera Face Wash 150 ml", "PureCare", 95, 160],
        ["Mint Toothpaste 150 g", "SmileBright", 58, 95],
        ["Body Lotion 400 ml", "SoftTouch", 190, 299],
        ["Sandal Bath Soap (4 pack)", "SoftTouch", 88, 140]
    ],
    Beverages: [
        ["Assam Tea 500 g", "Chai & Co", 185, 260],
        ["Instant Coffee 100 g", "BrewMaster", 230, 340],
        ["Mango Juice 1 L", "FruitFest", 72, 110],
        ["Mineral Water 1 L (case of 12)", "AquaClear", 150, 240],
        ["Green Tea (25 bags)", "Chai & Co", 110, 180, "INACTIVE"]
    ],
    Snacks: [
        ["Salted Potato Chips 150 g", "CrunchTime", 32, 50],
        ["Roasted Peanuts 400 g", "Desi Pantry", 70, 110],
        ["Cream Biscuits 300 g", "CrunchTime", 38, 60],
        ["Masala Namkeen 400 g", "Bharat Bites", 65, 99],
        ["Dark Chocolate Bar 100 g", "CocoaLeaf", 90, 150]
    ],
    Cleaning: [
        ["Dishwash Liquid 750 ml", "SparkleClean", 95, 145],
        ["Floor Cleaner 1 L", "SparkleClean", 105, 175],
        ["Detergent Powder 2 kg", "WashWell", 190, 285],
        ["Glass Cleaner 500 ml", "SparkleClean", 78, 125],
        ["Toilet Cleaner 500 ml", "WashWell", 70, 115]
    ],
    Clothing: [
        ["Cotton Crew T-Shirt (M)", "ThreadLine", 210, 449],
        ["Slim Fit Denim Jeans (32)", "ThreadLine", 690, 1299],
        ["Formal Cotton Shirt (L)", "Urban Weave", 520, 999, "INACTIVE"],
        ["Jogger Track Pants (L)", "Urban Weave", 330, 649],
        ["Cotton Socks (3 pairs)", "ThreadLine", 90, 199]
    ],
    Accessories: [
        ["Leather Bi-fold Wallet", "UrbanCarry", 340, 699],
        ["Analog Wrist Watch", "TimeCraft", 980, 1899],
        ["Laptop Backpack 15.6-inch", "UrbanCarry", 720, 1399],
        ["Polarised Sunglasses", "ShadeOn", 280, 599],
        ["Silicone Phone Cover", "ShadeOn", 70, 249]
    ]
};

// manager = a DEMO_USERS key. The inactive warehouse holds no stock (the app requires that).
const WAREHOUSES = [
    { code: "DEL-01", name: "Delhi Central Warehouse", city: "New Delhi", state: "Delhi", address: "Plot 14, Okhla Industrial Area Phase II", capacity: 1600, manager: "ravi" },
    { code: "NOI-01", name: "Noida Distribution Hub", city: "Noida", state: "Uttar Pradesh", address: "C-52, Sector 63", capacity: 1000, manager: "kavya" },
    { code: "MUM-01", name: "Mumbai Port Warehouse", city: "Mumbai", state: "Maharashtra", address: "Gala 7, Bhiwandi Logistics Park", capacity: 1500, manager: "arjun" },
    { code: "BLR-01", name: "Bengaluru South Depot", city: "Bengaluru", state: "Karnataka", address: "No. 88, Bommasandra Industrial Area", capacity: 1400, manager: "kavya" },
    { code: "HYD-01", name: "Hyderabad Retail Hub", city: "Hyderabad", state: "Telangana", address: "Survey 221, Medchal Road", capacity: 900, manager: "arjun" },
    { code: "JAI-01", name: "Jaipur Overflow Store", city: "Jaipur", state: "Rajasthan", address: "E-19, Sitapura Industrial Area", capacity: 800, manager: null, status: "INACTIVE" }
];

// categories = what each supplier sells (its purchase orders only contain those products)
const SUPPLIERS = [
    { name: "Acme Electronics Pvt Ltd", contactPerson: "Suresh Patel", email: "sales@acme-electronics.in", phone: "+91 98110 20431", city: "New Delhi", address: "Nehru Place, New Delhi", categories: ["Electronics", "Accessories"] },
    { name: "GreenHarvest Foods", contactPerson: "Manpreet Gill", email: "orders@greenharvest.example", phone: "+91 98722 11045", city: "Karnal", address: "GT Road, Karnal, Haryana", categories: ["Grocery"] },
    { name: "Bharat Foods & Spices", contactPerson: "Alok Jain", email: "supply@bharatfoods.example", phone: "+91 98260 55012", city: "Indore", address: "Sanwer Road, Indore", categories: ["Grocery", "Snacks"] },
    { name: "Voltix Technologies", contactPerson: "Deepa Rao", email: "b2b@voltix.example", phone: "+91 99001 73420", city: "Bengaluru", address: "Electronic City Phase 1, Bengaluru", categories: ["Electronics"] },
    { name: "PaperTrail Stationers", contactPerson: "Farhan Shaikh", email: "sales@papertrail.example", phone: "+91 98200 44187", city: "Mumbai", address: "Lower Parel, Mumbai", categories: ["Stationery"] },
    { name: "HomeNest Kitchenware", contactPerson: "Gurpreet Kaur", email: "trade@homenest.example", phone: "+91 98150 67230", city: "Ludhiana", address: "Focal Point, Ludhiana", categories: ["Home & Kitchen"] },
    { name: "PureCare Personal Products", contactPerson: "Hetal Shah", email: "orders@purecare.example", phone: "+91 98250 31876", city: "Ahmedabad", address: "Naroda GIDC, Ahmedabad", categories: ["Personal Care"] },
    { name: "Chai & Co Beverages", contactPerson: "Bikash Das", email: "wholesale@chaiandco.example", phone: "+91 94350 12098", city: "Guwahati", address: "Beltola Road, Guwahati", categories: ["Beverages"] },
    { name: "CrunchTime Snacks", contactPerson: "Snehal Kulkarni", email: "distribution@crunchtime.example", phone: "+91 98220 90341", city: "Pune", address: "Chakan MIDC, Pune", categories: ["Snacks"] },
    { name: "SparkleClean Industries", contactPerson: "Karthik Subramanian", email: "sales@sparkleclean.example", phone: "+91 98400 26714", city: "Chennai", address: "Ambattur Industrial Estate, Chennai", categories: ["Cleaning"] },
    { name: "ThreadLine Apparel", contactPerson: "Lakshmi Iyer", email: "b2b@threadline.example", phone: "+91 98430 71265", city: "Tiruppur", address: "Avinashi Road, Tiruppur", categories: ["Clothing"] },
    { name: "UrbanCarry Accessories", contactPerson: "Nikhil Rathore", email: "orders@urbancarry.example", phone: "+91 98290 13570", city: "Jaipur", address: "MI Road, Jaipur", categories: ["Accessories"] },
    { name: "FreshSip Drinks", contactPerson: "Omar Siddiqui", email: "sales@freshsip.example", phone: "+91 98480 62934", city: "Hyderabad", address: "Kukatpally, Hyderabad", categories: ["Beverages"], status: "INACTIVE" },
    { name: "OldTown Traders", contactPerson: "Pankaj Mishra", email: "contact@oldtowntraders.example", phone: "+91 94150 38821", city: "Kanpur", address: "Kidwai Nagar, Kanpur", categories: ["Home & Kitchen", "Cleaning"], status: "INACTIVE" },
    { name: "Metro Office Supplies", contactPerson: "Ritu Malhotra", email: "orders@metrooffice.example", phone: "+91 98110 84562", city: "Noida", address: "Sector 18, Noida", categories: ["Stationery", "Electronics"], status: "INACTIVE" }
];

// Customers don't log in; their details are saved inside each order.
// A few have no email on purpose (the Customers page then groups them by name + phone).
const CUSTOMERS = [
    ["Priya Sharma", "priya.sharma@mail.example", "+91 98100 12345", "12 MG Road, New Delhi"],
    ["Amit Khanna", "amit.khanna@mail.example", "+91 98111 23456", "45 Lajpat Nagar, New Delhi"],
    ["Sneha Reddy", "sneha.reddy@mail.example", "+91 99590 34567", "Plot 8, Banjara Hills, Hyderabad"],
    ["Rohan Deshmukh", "rohan.d@mail.example", "+91 98190 45678", "Flat 302, Andheri West, Mumbai"],
    ["Ananya Iyer", "ananya.iyer@mail.example", "+91 98450 56789", "22 Indiranagar, Bengaluru"],
    ["Vikram Singh", null, "+91 98290 67890", "7 Civil Lines, Jaipur"],
    ["Fatima Khan", "fatima.khan@mail.example", "+91 98110 78901", "B-14 Sector 62, Noida"],
    ["Karan Malhotra", "karan.m@mail.example", "+91 98180 89012", "33 Rajouri Garden, New Delhi"],
    ["Meera Pillai", "meera.pillai@mail.example", "+91 98470 90123", "Koramangala 5th Block, Bengaluru"],
    ["Siddharth Joshi", "sid.joshi@mail.example", "+91 98220 01234", "Baner Road, Pune"],
    ["Pooja Agarwal", "pooja.agarwal@mail.example", "+91 98300 11223", "Salt Lake Sector V, Kolkata"],
    ["Harish Menon", null, "+91 98460 22334", "Kakkanad, Kochi"],
    ["Neelam Gupta", "neelam.gupta@mail.example", "+91 98100 33445", "Dwarka Sector 10, New Delhi"],
    ["Arjun Kapoor", "arjun.kapoor@mail.example", "+91 98200 44556", "Powai, Mumbai"],
    ["Divya Nair", "divya.nair@mail.example", "+91 98440 55667", "Whitefield, Bengaluru"],
    ["Rajesh Yadav", null, "+91 98390 66778", "Gomti Nagar, Lucknow"],
    ["Kavita Bhatt", "kavita.bhatt@mail.example", "+91 98250 77889", "Satellite, Ahmedabad"],
    ["Manish Tiwari", "manish.tiwari@mail.example", "+91 98260 88990", "Vijay Nagar, Indore"],
    ["Shreya Ghosh", "shreya.ghosh@mail.example", "+91 98310 99001", "Park Street, Kolkata"],
    ["Aditya Rao", "aditya.rao@mail.example", "+91 99000 10112", "Jubilee Hills, Hyderabad"],
    ["Nisha Chauhan", "nisha.chauhan@mail.example", "+91 98110 21223", "Sector 15, Gurugram"],
    ["Imran Qureshi", null, "+91 98200 32334", "Bandra East, Mumbai"],
    ["Tanvi Kulkarni", "tanvi.k@mail.example", "+91 98230 43445", "Kothrud, Pune"],
    ["Gaurav Saxena", "gaurav.saxena@mail.example", "+91 98110 54556", "Indirapuram, Ghaziabad"],
    ["Lakshmi Narayanan", "lakshmi.n@mail.example", "+91 98400 65667", "Adyar, Chennai"],
    ["Rahul Bose", "rahul.bose@mail.example", "+91 98300 76778", "New Town, Kolkata"],
    ["Ishita Verma", "ishita.verma@mail.example", "+91 98100 87889", "Vasant Kunj, New Delhi"],
    ["Deepak Chaudhary", null, "+91 98290 98990", "Malviya Nagar, Jaipur"],
    ["Ritika Sethi", "ritika.sethi@mail.example", "+91 98150 09001", "Model Town, Ludhiana"],
    ["Varun Bhatia", "varun.bhatia@mail.example", "+91 98450 19112", "HSR Layout, Bengaluru"]
];

const CARRIERS = ["BlueDart", "Delhivery", "DTDC", "Ecom Express", "India Post"];

const ADJUSTMENT_NOTES = {
    down: [
        "Damaged in handling — written off",
        "Expired stock removed from shelf",
        "Cycle count: units missing",
        "Water damage during monsoon",
        "Packaging torn — not saleable"
    ],
    up: ["Cycle count: extra units found", "Unrecorded return added back", "Mis-shelved units located"]
};

module.exports = { DEMO_USERS, CATEGORIES, PRODUCTS, WAREHOUSES, SUPPLIERS, CUSTOMERS, CARRIERS, ADJUSTMENT_NOTES };
