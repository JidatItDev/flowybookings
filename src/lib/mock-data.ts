// Mock data for the SaaS booking platform UI demo.
// Replace with real backend (Lovable Cloud) when wiring multi-tenant data.

export type BookingStatus =
  | "pending"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no-show";

export type PaymentStatus = "paid" | "unpaid" | "refunded" | "partial";

export interface Booking {
  id: string;
  customer: string;
  service: string;
  staff: string;
  date: string; // ISO
  duration: number;
  price: number;
  status: BookingStatus;
  payment: PaymentStatus;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  visits: number;
  totalSpent: number;
  lastVisit: string;
  notes?: string;
}

export interface Service {
  id: string;
  name: string;
  category: string;
  duration: number;
  price: number;
  deposit: number;
  active: boolean;
}

export interface StaffMember {
  id: string;
  name: string;
  role: string;
  email: string;
  active: boolean;
  services: string[];
  hours: string;
}

const today = new Date();
const iso = (h: number, m = 0, dayOffset = 0) => {
  const d = new Date(today);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export const bookings: Booking[] = [
  { id: "b1", customer: "Sophia Reyes", service: "Sleeve Tattoo Session", staff: "Marco", date: iso(10), duration: 120, price: 320, status: "confirmed", payment: "partial" },
  { id: "b2", customer: "Liam Chen", service: "Beard Trim", staff: "Aria", date: iso(11), duration: 30, price: 25, status: "completed", payment: "paid" },
  { id: "b3", customer: "Noah Patel", service: "Gel Manicure", staff: "Iris", date: iso(13), duration: 60, price: 45, status: "pending", payment: "unpaid" },
  { id: "b4", customer: "Ava Müller", service: "Lash Extensions", staff: "Iris", date: iso(15), duration: 90, price: 110, status: "confirmed", payment: "paid" },
  { id: "b5", customer: "Mateo Rossi", service: "Dog Grooming — Medium", staff: "Theo", date: iso(16, 30), duration: 75, price: 65, status: "no-show", payment: "unpaid" },
  { id: "b6", customer: "Zoe Kim", service: "Hair Color", staff: "Aria", date: iso(9, 0, 1), duration: 150, price: 180, status: "confirmed", payment: "partial" },
  { id: "b7", customer: "Eli Brown", service: "Classic Haircut", staff: "Marco", date: iso(14, 30, 1), duration: 45, price: 35, status: "pending", payment: "unpaid" },
  { id: "b8", customer: "Maya Singh", service: "Pedicure Spa", staff: "Iris", date: iso(11, 0, 2), duration: 60, price: 55, status: "confirmed", payment: "paid" },
];

export const customers: Customer[] = [
  { id: "c1", name: "Sophia Reyes", phone: "+1 415 555 0102", email: "sophia@reyes.io", visits: 12, totalSpent: 2840, lastVisit: "2 days ago", notes: "Allergic to nickel." },
  { id: "c2", name: "Liam Chen", phone: "+1 415 555 0144", email: "liam.chen@mail.com", visits: 8, totalSpent: 320, lastVisit: "Today" },
  { id: "c3", name: "Ava Müller", phone: "+49 30 5550 998", email: "ava@muller.de", visits: 5, totalSpent: 540, lastVisit: "1 week ago", notes: "Prefers Iris." },
  { id: "c4", name: "Mateo Rossi", phone: "+39 06 5550 221", email: "mateo@rossi.it", visits: 3, totalSpent: 195, lastVisit: "3 weeks ago" },
  { id: "c5", name: "Zoe Kim", phone: "+1 212 555 0188", email: "zoe.k@studio.nyc", visits: 22, totalSpent: 4120, lastVisit: "Yesterday", notes: "VIP — book Aria." },
  { id: "c6", name: "Maya Singh", phone: "+44 20 5555 7700", email: "maya@singh.uk", visits: 6, totalSpent: 410, lastVisit: "5 days ago" },
];

export const services: Service[] = [
  { id: "s1", name: "Classic Haircut", category: "Hair", duration: 45, price: 35, deposit: 0, active: true },
  { id: "s2", name: "Hair Color", category: "Hair", duration: 150, price: 180, deposit: 40, active: true },
  { id: "s3", name: "Beard Trim", category: "Hair", duration: 30, price: 25, deposit: 0, active: true },
  { id: "s4", name: "Gel Manicure", category: "Nails", duration: 60, price: 45, deposit: 10, active: true },
  { id: "s5", name: "Pedicure Spa", category: "Nails", duration: 60, price: 55, deposit: 10, active: true },
  { id: "s6", name: "Lash Extensions", category: "Beauty", duration: 90, price: 110, deposit: 25, active: true },
  { id: "s7", name: "Sleeve Tattoo Session", category: "Tattoo", duration: 120, price: 320, deposit: 80, active: true },
  { id: "s8", name: "Dog Grooming — Medium", category: "Pet", duration: 75, price: 65, deposit: 15, active: false },
];

export const staff: StaffMember[] = [
  { id: "st1", name: "Marco Bianchi", role: "Senior Barber", email: "marco@shop.com", active: true, services: ["Classic Haircut", "Beard Trim", "Sleeve Tattoo Session"], hours: "Mon–Fri · 9–18" },
  { id: "st2", name: "Aria Patel", role: "Stylist", email: "aria@shop.com", active: true, services: ["Hair Color", "Beard Trim"], hours: "Tue–Sat · 10–19" },
  { id: "st3", name: "Iris Nakamura", role: "Nail & Lash Tech", email: "iris@shop.com", active: true, services: ["Gel Manicure", "Pedicure Spa", "Lash Extensions"], hours: "Wed–Sun · 11–20" },
  { id: "st4", name: "Theo Bauer", role: "Pet Groomer", email: "theo@shop.com", active: false, services: ["Dog Grooming — Medium"], hours: "Mon–Wed · 9–17" },
];

export const revenueWeekly = [
  { day: "Mon", revenue: 420, bookings: 8 },
  { day: "Tue", revenue: 680, bookings: 11 },
  { day: "Wed", revenue: 520, bookings: 9 },
  { day: "Thu", revenue: 910, bookings: 14 },
  { day: "Fri", revenue: 1240, bookings: 18 },
  { day: "Sat", revenue: 1580, bookings: 22 },
  { day: "Sun", revenue: 760, bookings: 12 },
];

export const revenueMonthly = [
  { month: "Jan", revenue: 12400 },
  { month: "Feb", revenue: 13800 },
  { month: "Mar", revenue: 15200 },
  { month: "Apr", revenue: 14100 },
  { month: "May", revenue: 17600 },
  { month: "Jun", revenue: 19200 },
  { month: "Jul", revenue: 21800 },
  { month: "Aug", revenue: 22400 },
];

// Super admin / platform-wide
export interface Shop {
  id: string;
  name: string;
  type: string;
  owner: string;
  city: string;
  plan: "Trial" | "Starter" | "Pro" | "Premium";
  status: "active" | "suspended" | "pending";
  bookings: number;
  gmv: number;
  createdAt: string;
}

export const shops: Shop[] = [
  { id: "sh1", name: "Inkwell Studio", type: "Tattoo", owner: "Marco Bianchi", city: "Berlin", plan: "Pro", status: "active", bookings: 312, gmv: 28400, createdAt: "Mar 12, 2024" },
  { id: "sh2", name: "Sharp & Co.", type: "Barber", owner: "Liam Chen", city: "London", plan: "Starter", status: "active", bookings: 188, gmv: 9120, createdAt: "Jun 02, 2024" },
  { id: "sh3", name: "Bloom Nail Bar", type: "Nails", owner: "Iris Nakamura", city: "Tokyo", plan: "Premium", status: "active", bookings: 421, gmv: 38900, createdAt: "Jan 18, 2024" },
  { id: "sh4", name: "Glow Lash Lab", type: "Beauty", owner: "Ava Müller", city: "Paris", plan: "Pro", status: "active", bookings: 256, gmv: 22100, createdAt: "Apr 09, 2024" },
  { id: "sh5", name: "Pawsh Grooming", type: "Pet", owner: "Theo Bauer", city: "Munich", plan: "Trial", status: "pending", bookings: 14, gmv: 620, createdAt: "Sep 28, 2024" },
  { id: "sh6", name: "Velvet Hair Atelier", type: "Hair", owner: "Aria Patel", city: "New York", plan: "Premium", status: "suspended", bookings: 502, gmv: 47200, createdAt: "Nov 14, 2023" },
];

export const platformUsers = [
  { id: "u1", name: "Marco Bianchi", email: "marco@inkwell.io", role: "Shop Owner", shop: "Inkwell Studio", status: "active" },
  { id: "u2", name: "Liam Chen", email: "liam@sharp.co", role: "Shop Owner", shop: "Sharp & Co.", status: "active" },
  { id: "u3", name: "Iris Nakamura", email: "iris@bloom.jp", role: "Shop Owner", shop: "Bloom Nail Bar", status: "active" },
  { id: "u4", name: "Aria Patel", email: "aria@velvet.nyc", role: "Shop Owner", shop: "Velvet Hair Atelier", status: "suspended" },
  { id: "u5", name: "Sophia Reyes", email: "sophia@reyes.io", role: "Customer", shop: "—", status: "active" },
  { id: "u6", name: "Theo Bauer", email: "theo@pawsh.de", role: "Staff", shop: "Pawsh Grooming", status: "active" },
  { id: "u7", name: "Ava Müller", email: "ava@glow.fr", role: "Shop Owner", shop: "Glow Lash Lab", status: "active" },
];

export const plans = [
  { id: "p1", name: "Trial", price: 0, period: "14 days", fee: "0%", features: ["1 staff", "Up to 30 bookings", "Email reminders"], shops: 12 },
  { id: "p2", name: "Starter", price: 19, period: "month", fee: "1.5%", features: ["3 staff", "Unlimited bookings", "SMS + Email reminders", "Basic analytics"], shops: 84 },
  { id: "p3", name: "Pro", price: 49, period: "month", fee: "1.0%", features: ["10 staff", "WhatsApp reminders", "Advanced analytics", "Custom branding"], shops: 142 },
  { id: "p4", name: "Premium", price: 99, period: "month", fee: "0.5%", features: ["Unlimited staff", "Multi-location", "Priority support", "API access"], shops: 38 },
];

export const supportTickets = [
  { id: "t1", subject: "Stripe payouts delayed", shop: "Inkwell Studio", priority: "High", status: "Open", updated: "12 min ago" },
  { id: "t2", subject: "Cannot import customers CSV", shop: "Bloom Nail Bar", priority: "Medium", status: "In progress", updated: "1 hr ago" },
  { id: "t3", subject: "Reminder template variables", shop: "Sharp & Co.", priority: "Low", status: "Open", updated: "3 hrs ago" },
  { id: "t4", subject: "Refund a duplicate charge", shop: "Glow Lash Lab", priority: "High", status: "Waiting", updated: "Yesterday" },
  { id: "t5", subject: "Plan downgrade question", shop: "Pawsh Grooming", priority: "Low", status: "Resolved", updated: "2 days ago" },
];

export const auditLogs = [
  { id: "a1", actor: "admin@bookly.io", action: "Suspended shop", target: "Velvet Hair Atelier", time: "2 hrs ago", type: "shop" },
  { id: "a2", actor: "system", action: "Failed payment retry", target: "Sharp & Co. · €19.00", time: "4 hrs ago", type: "payment" },
  { id: "a3", actor: "marco@inkwell.io", action: "Updated booking", target: "Booking #b1", time: "6 hrs ago", type: "booking" },
  { id: "a4", actor: "admin@bookly.io", action: "Approved shop", target: "Pawsh Grooming", time: "1 day ago", type: "shop" },
  { id: "a5", actor: "iris@bloom.jp", action: "Refund issued", target: "Booking #b22 · ¥6,500", time: "2 days ago", type: "payment" },
];

export const platformMetrics = [
  { month: "Jan", shops: 142, gmv: 84000, fees: 1260 },
  { month: "Feb", shops: 168, gmv: 96000, fees: 1440 },
  { month: "Mar", shops: 201, gmv: 114000, fees: 1710 },
  { month: "Apr", shops: 228, gmv: 132000, fees: 1980 },
  { month: "May", shops: 254, gmv: 148000, fees: 2220 },
  { month: "Jun", shops: 276, gmv: 165000, fees: 2475 },
];
