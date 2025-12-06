// --- Firebase Admin (Correct Setup) ---
var admin = require("firebase-admin");
var serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

var db = admin.firestore();

// --- EXPRESS SETUP ---
const express = require("express");
const session = require("express-session");
const bodyParser = require("body-parser");
const ph = require("password-hash");

const app = express();
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.use(
  session({
    secret: "food donation app",
    resave: true,
    saveUninitialized: true
  })
);

// ---------------- LOGIN PROTECTION ----------------
function requireDonorLogin(req, res, next) {
  if (!req.session.userEmail) return res.redirect("/donlogin");
  next();
}

function requireOrgLogin(req, res, next) {
  if (!req.session.orgEmail) return res.redirect("/orglogin");
  next();
}

// ---------------- HOME ROUTES ----------------
app.get("/", (req, res) => res.render("intro"));
app.get("/signup", (req, res) => res.render("reg_home"));
app.get("/orgRegister", (req, res) => res.render("org_register", { sucState: false, errState: false }));
app.get("/donRegister", (req, res) => res.render("don_register", { sucState: false, errState: false }));
app.get("/orglogin", (req, res) => res.render("org_login", { errState: false }));
app.get("/donlogin", (req, res) => res.render("don_login", { errState: false }));

// ✅✅✅ FIXED: Grocery Page Route (THIS WAS MISSING)
app.get("/donat_grocy", requireDonorLogin, (req, res) => {
  res.render("grocery_donate_form"); 
});

// ---------------- ORGANIZATION REGISTER ----------------
app.post("/org_register_submit", async (req, res) => {
  try {
    const { email, psw, c_psw } = req.body;

    const orgdb = await db.collection("Organizations").where("email", "==", email).get();
    if (!orgdb.empty)
      return res.render("org_register", { sucState: false, errState: true, errMsg: "Organization Already Exists!" });

    if (psw !== c_psw)
      return res.render("org_register", { sucState: false, errState: true, errMsg: "Password Doesn't Match!" });

    await db.collection("Organizations").add({
      organization_name: req.body.organization_name,
      organization_id: req.body.org_id,
      owner_name: req.body.owner_name,
      email,
      password: ph.generate(psw),
      ph_no: req.body.phone_no,
      state: req.body.state,
      dist: req.body.district,
      city: req.body.city,
      street: req.body.street,
      pincode: req.body.pincode
    });

    res.render("org_register", { sucState: true, errState: false });
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

// ---------------- DONOR REGISTER ----------------
app.post("/don_register_submit", async (req, res) => {
  try {
    const { email, psw, c_psw } = req.body;

    const donDB = await db.collection("Donors").where("email", "==", email).get();
    if (!donDB.empty)
      return res.render("don_register", { sucState: false, errState: true, errMsg: "Donor Already Exists!" });

    if (psw !== c_psw)
      return res.render("don_register", { sucState: false, errState: true, errMsg: "Password Doesn't Match!" });

    await db.collection("Donors").add({
      Donor_name: req.body.user_name,
      email,
      password: ph.generate(psw),
      ph_no: req.body.phone_no,
      state: req.body.state,
      dist: req.body.district,
      city: req.body.city,
      street: req.body.street,
      pincode: req.body.pincode
    });

    res.render("don_register", { sucState: true, errState: false });
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

// ---------------- ORGANIZATION LOGIN ----------------
app.post("/org_login_submit", async (req, res) => {
  try {
    const { email, psw, org_id } = req.body;

    const orgdb = await db.collection("Organizations").where("email", "==", email).get();
    if (orgdb.empty)
      return res.render("org_login", { errState: true, errMsg: "Organization Not Found!" });

    const userData = orgdb.docs[0].data();

    if (!ph.verify(psw, userData.password))
      return res.render("org_login", { errState: true, errMsg: "Incorrect Password!" });

    if (org_id !== userData.organization_id)
      return res.render("org_login", { errState: true, errMsg: "Invalid Organization ID!" });

    req.session.orgEmail = email;

    const orgHis = await orgdb.docs[0].ref.collection("Donation_History").get();
    const org_his_data = orgHis.docs.map(doc => doc.data());

    res.render("org_home", { name: userData.organization_name, dataArr: { org_his_data } });
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

// ---------------- DONOR LOGIN ----------------
app.post("/don_login_submit", async (req, res) => {
  try {
    const { email, psw } = req.body;

    const donDB = await db.collection("Donors").where("email", "==", email).get();
    if (donDB.empty)
      return res.render("don_login", { errState: true, errMsg: "Donor Not Found!" });

    const userData = donDB.docs[0].data();

    if (!ph.verify(psw, userData.password))
      return res.render("don_login", { errState: true, errMsg: "Incorrect Password!" });

    req.session.userEmail = email;
    req.session.userName = userData.Donor_name;

    res.redirect("/don_home");
  } catch (err) {
    console.log(err);
    res.status(500).send("Server error");
  }
});

// ---------------- DONOR HOME ----------------
app.get("/don_home", requireDonorLogin, (req, res) => {
  res.render("don_home", { name: req.session.userName });
});

// ---------------- FOOD DONATE ----------------
app.get("/donat_food", requireDonorLogin, async (req, res) => {
  const don_data = await db.collection("Donors").where("email", "==", req.session.userEmail).get();
  const org_data = await db.collection("Organizations").get();

  res.render("food_donate_form", {
    don_details: don_data.docs[0].data(),
    dataArr: { org_data: org_data.docs.map(doc => doc.data()) }
  });
});

// ---------------- DONATE FOOD SUBMIT ----------------
app.post("/donatefoodsubmit", requireDonorLogin, async (req, res) => {
  try {
    const user_email = req.session.userEmail;
    const donData = await db.collection("Donors").where("email", "==", user_email).get();

    const donorInfo = donData.docs[0].data();
    const donRef = donData.docs[0].ref;

    const orgData = await db.collection("Organizations")
      .where("organization_name", "==", req.body.org_name)
      .get();
    const orgRef = orgData.docs[0].ref;

    const donationData = {
      Donate_to: req.body.org_name,
      Donation: "Food",
      Items: Array.isArray(req.body.item) ? req.body.item : [req.body.item],
      EachItem_Qty: Array.isArray(req.body.qty) ? req.body.qty : [req.body.qty],
      Donor_name: donorInfo.Donor_name,
      Donor_email: donorInfo.email,
      Donor_ph_no: donorInfo.ph_no,
      Donor_address: donorInfo.street + ", " + donorInfo.city,
      Date: new Date().toISOString().split("T")[0],
      Status: "Pending",
      time: "Waiting"
    };

    await donRef.collection("Donation_History").add(donationData);
    await orgRef.collection("Donation_History").add(donationData);

    res.redirect("/don_history");
  } catch (err) {
    console.log(err);
    res.status(500).send("Donation error");
  }
});

// ---------------- DONOR HISTORY ----------------
app.get("/don_history", requireDonorLogin, async (req, res) => {
  const donData = await db.collection("Donors").where("email", "==", req.session.userEmail).get();
  const historySnapshot = await donData.docs[0].ref.collection("Donation_History").get();

  res.render("don_history", {
    name: donData.docs[0].data().Donor_name,
    dataArr: { don_his_data: historySnapshot.docs.map(doc => doc.data()) }
  });
});

// ---------------- ORGANIZATION HISTORY ----------------
app.get("/org_history", requireOrgLogin, async (req, res) => {
  const orgDB = await db.collection("Organizations").where("email", "==", req.session.orgEmail).get();
  const historySnapshot = await orgDB.docs[0].ref.collection("Donation_History").get();

  res.render("org_history", {
    name: orgDB.docs[0].data().organization_name,
    dataArr: { org_his_data: historySnapshot.docs.map(doc => doc.data()) }
  });
});

// ✅✅✅ ACCEPT DONATION FINAL FIX ✅✅✅
app.post("/donation_accept", requireOrgLogin, async (req, res) => {
  try {
    const { orderemail, orderid, time } = req.body;

    const donorSnap = await db.collection("Donors").where("email", "==", orderemail).get();
    const donorRef = donorSnap.docs[0].ref;

    const donorHistory = await donorRef.collection("Donation_History").where("Date", "==", orderid).get();
    donorHistory.forEach(doc => doc.ref.update({ Status: "Accepted", time }));

    const orgSnap = await db.collection("Organizations").where("email", "==", req.session.orgEmail).get();
    const orgRef = orgSnap.docs[0].ref;

    const orgHistory = await orgRef.collection("Donation_History").where("Date", "==", orderid).get();
    orgHistory.forEach(doc => doc.ref.update({ Status: "Accepted", time }));

    res.redirect("/org_history");
  } catch (err) {
    console.log(err);
    res.send("Accept error");
  }
});

// ---------------- SERVER START ----------------
app.listen(3000, () => {
  console.log("✅ Server runs on port 3000");
});