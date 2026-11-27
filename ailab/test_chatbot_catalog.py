"""C03 - kiểm thử danh mục, định tuyến game, chọn model. Spec: docs/chatbot/C03_SPEC.md §4."""
import json
import os
import shutil
import sys
import tempfile
import time
import unittest

_TMP = tempfile.mkdtemp(prefix="ailab_c03_boot_")
os.environ.setdefault("AILAB_DB", os.path.join(_TMP, "boot.db"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import contract  # noqa: E402
import llm  # noqa: E402
import store  # noqa: E402
from chatbot import schemas  # noqa: E402
from chatbot import catalog  # noqa: E402

QUIZ = contract.parse(llm.QUIZ_TEMPLATE.replace("__TITLE__", "Quiz"))[0]
WHEEL = contract.parse(llm.WHEEL_TEMPLATE.replace("__TITLE__", "Vong"))[0]
HANDS4 = {"name": "Tay", "description": "", "kinds": ["hands"],
          "inputs": [{"key": k, "label": k, "required": True, "accepts": ["action"]} for k in "ABCD"]}
EXAM_PLAIN = {"name": "De", "description": "", "questions": "exam"}


def out(*pairs):
    return [{"key": k, "role": r} for k, r in pairs]


def model(mid, kind, outputs, mine=False, name=None):
    return {"id": mid, "name": name or "M%d" % mid, "kind": kind, "outputs": outputs, "mine": mine,
            "builtin": False, "visibility": "public"}


def img4(mid=10, mine=False):
    return model(mid, "image", out(("A", "action"), ("B", "action"), ("C", "action"), ("D", "action")), mine)


HANDS = model(2, "hands", out(("fist", "action"), ("open", "action"), ("none", "empty")), name="Bàn tay")


def player(pid, name, man, sample=False, status="approved", mine=False):
    return {"id": pid, "name": name, "description": "", "ownerId": None if sample else 5, "mine": mine,
            "sample": sample, "status": status, "visibility": "public", "manifest": man}


def default_catalog(models=()):
    return {"players": [player(1, "Quiz ABCD", QUIZ, True), player(2, "Vòng quay", WHEEL, True)], "models": list(models)}


def req(mode="auto", pid=None, desc=None, use=None, kinds=(), **extra):
    r = schemas.normalize_requirements(None)
    r["gamePreference"] = {"mode": mode, "playerId": pid, "description": desc}
    r["interaction"] = {"mouse": True, "requestedKinds": list(kinds), "useModel": use}
    r.update(extra)
    return r


def codes(sel):
    return [c["code"] for c in sel["conflicts"]]


class PureTests(unittest.TestCase):
    def test_c03_02_describe_player(self):
        q = catalog.describe_player(QUIZ)
        self.assertEqual(q["gameKind"], "questions")
        self.assertTrue(q["needsModel"])
        self.assertEqual(q["requiredCount"], 4)
        self.assertEqual(len(q["inputs"]), 4)
        self.assertEqual(q["runtimeKinds"], [k for k in q["kinds"] if k in catalog.RUNTIME_KINDS])
        w = catalog.describe_player(WHEEL)
        self.assertEqual(w["gameKind"], "list")
        self.assertFalse(w["needsModel"])
        self.assertEqual((w["requiredCount"], w["kinds"], w["runtimeKinds"], w["inputs"]), (0, [], [], []))
        e = catalog.describe_player(EXAM_PLAIN)
        self.assertEqual(e["gameKind"], "questions")
        self.assertFalse(e["needsModel"])
        self.assertEqual(e["requiredCount"], 0)

    def test_c03_03a_selected_pure(self):
        sel = catalog.select_model(QUIZ, [HANDS, img4()], req(use=True)["interaction"])
        self.assertEqual(sel["status"], "selected")
        self.assertEqual(sel["modelId"], 10)
        self.assertEqual(sel["kind"], "image")
        self.assertEqual(set(sel["mapping"]), {"A", "B", "C", "D"})
        self.assertEqual(len(set(sel["mapping"].values())), 4)
        self.assertTrue(sel["mouse"])
        self.assertEqual(sel["conflicts"], [])

    def test_c03_03b_preference_mine_then_id(self):
        sel = catalog.select_model(QUIZ, [img4(10), img4(11, mine=True), img4(9)], req()["interaction"])
        self.assertEqual(sel["modelId"], 11)
        sel = catalog.select_model(QUIZ, [img4(10), img4(9)], req()["interaction"])
        self.assertEqual(sel["modelId"], 9)

    def test_auto_mapping_names_and_roles(self):
        m = model(3, "image", out(("x", "empty"), ("d", "action"), ("Z", "action"), ("a", "action"), ("y", "action"), ("w", "action")))
        mp = catalog.auto_mapping(QUIZ, m)
        self.assertEqual(mp["A"], "a")
        self.assertEqual(mp["D"], "d")
        self.assertEqual(set(mp), {"A", "B", "C", "D"})
        self.assertEqual(len(set(mp.values())), len(mp))
        self.assertNotIn("x", mp.values())  # lớp empty không gắn vào ô chỉ nhận action

    def test_c03_04_only_hands_for_quiz(self):
        sel = catalog.select_model(QUIZ, [HANDS], req()["interaction"])
        self.assertEqual(sel["status"], "conflict")
        self.assertIsNone(sel["modelId"])
        self.assertIn("incompatible_model", codes(sel))
        self.assertEqual(sel["mapping"], {})
        self.assertTrue(sel["reason"])

    def test_c03_05_hands_too_few_layers(self):
        sel = catalog.select_model(HANDS4, [HANDS], req()["interaction"])
        self.assertEqual(sel["status"], "conflict")
        self.assertIsNone(sel["modelId"])
        self.assertIn("incompatible_model", codes(sel))
        text = sel["reason"] + " ".join(c["message"] for c in sel["conflicts"])
        self.assertIn("4", text)
        self.assertIn("2", text)

    def test_c03_06_validate_mapping(self):
        m = img4()
        ok = catalog.validate_mapping(QUIZ, m, {"A": "A", "B": "B", "C": "C", "D": "D"})
        self.assertTrue(ok["ok"])
        self.assertEqual(ok["errors"], [])
        self.assertIn("check", ok)
        cases = {
            "dup": ({"A": "A", "B": "A", "C": "C", "D": "D"}, None),
            "missing_layer": ({"A": "A", "B": "B", "C": "C", "D": "ZZ"}, "D"),
            "missing_input": ({"A": "A", "B": "B", "C": "C"}, "D"),
            "unknown_key": ({"A": "A", "B": "B", "C": "C", "D": "D", "Q": "A"}, "Q"),
        }
        for name, (mp, key) in cases.items():
            r = catalog.validate_mapping(QUIZ, m, mp)
            self.assertFalse(r["ok"], name)
            self.assertTrue(r["errors"], name)
            for e in r["errors"]:
                self.assertIn(e["code"], schemas.ERROR_CODES)
                self.assertTrue({"input", "code", "message"} <= set(e))
            if key:
                self.assertIn(key, [e["input"] for e in r["errors"]], name)
        # sai role: lớp empty vào ô chỉ nhận action
        m2 = model(4, "image", out(("A", "action"), ("B", "action"), ("C", "action"), ("D", "empty")))
        r = catalog.validate_mapping(QUIZ, m2, {"A": "A", "B": "B", "C": "C", "D": "D"})
        self.assertFalse(r["ok"])
        self.assertIn("D", [e["input"] for e in r["errors"]])
        # sai kind
        self.assertFalse(catalog.validate_mapping(QUIZ, HANDS, {"A": "fist"})["ok"])

    def test_c03_07_use_model_false_camera(self):
        sel = catalog.select_model(QUIZ, [img4()], req(use=False)["interaction"])
        self.assertEqual(sel["status"], "conflict")
        self.assertIsNone(sel["modelId"])
        self.assertEqual(sel["mapping"], {})
        self.assertIn("incompatible_model", codes(sel))
        self.assertTrue(all(c["options"] for c in sel["conflicts"]))

    def test_c03_08_use_model_false_plain(self):
        for ia in (req(use=False)["interaction"], req()["interaction"]):
            sel = catalog.select_model(WHEEL, [img4()], ia)
            self.assertEqual(sel["status"], "not_needed")
            self.assertIsNone(sel["modelId"])
            self.assertEqual(sel["mapping"], {})
            self.assertEqual(sel["conflicts"], [])

    def test_plain_game_wants_camera(self):
        for ia in (req(use=True)["interaction"], req(kinds=["image"])["interaction"]):
            sel = catalog.select_model(WHEEL, [img4()], ia)
            self.assertEqual(sel["status"], "conflict")
            self.assertIn("unsupported_interaction", codes(sel))
            self.assertIsNone(sel["modelId"])

    def test_c03_09_audio(self):
        aud = model(7, "audio", out(("A", "action"), ("B", "action"), ("C", "action"), ("D", "action")), mine=True)
        for ms in ([aud], [aud, img4()]):
            sel = catalog.select_model(QUIZ, ms, req(kinds=["audio"])["interaction"])
            self.assertEqual(sel["status"], "conflict")
            self.assertIn("unsupported_interaction", codes(sel))
            self.assertIsNone(sel["modelId"])
        man = dict(QUIZ, kinds=["audio", "image"])  # audio có trong manifest.kinds vẫn không chạy được
        self.assertFalse(catalog.validate_mapping(man, aud, {"A": "A", "B": "B", "C": "C", "D": "D"})["ok"])

    def test_requested_kind_filters(self):
        pose = model(12, "pose", out(("A", "action"), ("B", "action"), ("C", "action"), ("D", "action")))
        sel = catalog.select_model(QUIZ, [img4(10), pose], req(kinds=["pose"])["interaction"])
        self.assertEqual((sel["status"], sel["modelId"], sel["kind"]), ("selected", 12, "pose"))

    def test_c03_10_route_forbidden(self):
        # Player 3 (riêng tư của người khác) không có trong catalog của người gọi, giống id không tồn tại.
        cat = default_catalog([img4()])
        a = catalog.route_game(req(pid=999), cat)
        b = catalog.route_game(req(pid=3), cat)
        for r in (a, b):
            self.assertIsNone(r["mode"])
            self.assertIsNone(r["playerId"])
            self.assertEqual(r["conflicts"][0]["code"], "forbidden_resource")
            self.assertTrue(r["questions"])
        self.assertEqual(a["conflicts"][0]["message"], b["conflicts"][0]["message"])
        self.assertEqual(a["reason"], b["reason"])
        self.assertNotIn(3, [x["playerId"] for x in b["alternatives"]])

    def test_c03_11_keep_player_conflict(self):
        cat = default_catalog([img4()])
        r = catalog.route_game(req(pid=2, desc="game hỏi đáp trắc nghiệm toán", subject="Toán"), cat)
        self.assertEqual(r["playerId"], 2)
        self.assertEqual(r["mode"], "reuse_existing")
        self.assertTrue(r["conflicts"])
        for c in r["conflicts"]:
            self.assertIn(c["code"], schemas.ERROR_CODES)
        self.assertTrue(r["questions"])
        self.assertTrue(r["alternatives"])
        self.assertLessEqual(len(r["alternatives"]), 3)
        ids = {p["id"] for p in cat["players"]}
        for a in r["alternatives"]:
            self.assertIn(a["playerId"], ids)
            self.assertNotEqual(a["playerId"], 2)

    def test_c03_12_math_no_model_auto(self):
        r = catalog.route_game(req(use=False, subject="Toán", desc="ôn toán lớp 2 trắc nghiệm"), default_catalog([img4()]))
        self.assertEqual(r["mode"], "generate_new")
        self.assertIsNone(r["playerId"])
        self.assertTrue(r["reason"])

    def test_c03_13_math_no_model_reuse_only(self):
        r = catalog.route_game(req(mode="reuse_existing", use=False, desc="ôn toán lớp 2 trắc nghiệm"), default_catalog([img4()]))
        self.assertIsNone(r["mode"])
        self.assertIsNone(r["playerId"])
        self.assertTrue(r["conflicts"])
        self.assertTrue(r["questions"])

    def test_c03_14_wheel(self):
        r = catalog.route_game(req(desc="vòng quay chọn tên học sinh"), default_catalog())
        self.assertEqual((r["mode"], r["playerId"]), ("reuse_existing", 2))
        self.assertEqual(r["selection"]["status"], "not_needed")

    def test_c03_15_quiz_with_model(self):
        r = catalog.route_game(req(desc="trắc nghiệm ABCD bằng cử chỉ", use=True), default_catalog([img4()]))
        self.assertEqual((r["mode"], r["playerId"]), ("reuse_existing", 1))
        self.assertEqual(r["selection"]["status"], "selected")
        self.assertEqual(r["selection"]["modelId"], 10)

    def test_c03_16_generate_new(self):
        r = catalog.route_game(req(mode="generate_new", desc="game mới"), default_catalog([img4()]))
        self.assertEqual(r["mode"], "generate_new")
        self.assertIsNone(r["playerId"])

    def test_c03_17_unknown_kind(self):
        r = catalog.route_game(req(desc="vòng quay"), default_catalog([img4()]))
        self.assertIsNone(r["mode"])
        self.assertIsNone(r["playerId"])
        self.assertTrue(any(q.get("field") for q in r["questions"]))

    def test_c03_18_no_mutation(self):
        cat = default_catalog([img4(), HANDS])
        cases = [req(desc="trắc nghiệm ABCD", use=True), req(pid=2, desc="hỏi đáp trắc nghiệm"), req(pid=99),
                 req(mode="generate_new"), req(use=False, desc="toán trắc nghiệm")]
        dump = lambda *a: json.dumps(a, sort_keys=True, ensure_ascii=False)
        for r in cases:
            before = dump(r, cat)
            catalog.route_game(r, cat)
            self.assertEqual(before, dump(r, cat))
        for man in (QUIZ, WHEEL, HANDS4):
            for ia in (req(use=True)["interaction"], req(use=False)["interaction"], req(kinds=["audio"])["interaction"]):
                before = dump(man, cat["models"], ia)
                catalog.describe_player(man)
                catalog.select_model(man, cat["models"], ia)
                catalog.auto_mapping(man, cat["models"][0])
                catalog.validate_mapping(man, cat["models"][0], {"A": "A"})
                self.assertEqual(before, dump(man, cat["models"], ia))


def man_of(inputs, kinds=("image",)):
    return {"name": "T", "description": "", "kinds": list(kinds),
            "inputs": [{"key": k, "label": k, "required": r, "accepts": list(a)} for k, r, a in inputs]}


def brute_required(man, model):
    ins = man["inputs"]
    outs = model["outputs"]
    req_idx = [i for i, x in enumerate(ins) if x["required"]]
    best = 0

    def rec(pos, used, cnt):
        nonlocal best
        if pos == len(req_idx):
            best = max(best, cnt)
            return
        rec(pos + 1, used, cnt)
        for j, o in enumerate(outs):
            if j not in used and o["role"] in ins[req_idx[pos]]["accepts"]:
                rec(pos + 1, used | {j}, cnt + 1)

    rec(0, frozenset(), 0)
    return best


class MatchingTests(unittest.TestCase):
    def snap(self, *a):
        return json.dumps(a, sort_keys=True, ensure_ascii=False)

    def test_c03_20_no_inputs_use_model_false_keeps_kinds(self):
        ia = req(use=False, kinds=["hands"])["interaction"]
        before = self.snap(WHEEL, ia)
        sel = catalog.select_model(WHEEL, [HANDS], ia)
        self.assertEqual(sel["status"], "not_needed")
        self.assertIsNone(sel["modelId"])
        self.assertEqual(sel["mapping"], {})
        sel = catalog.select_model(QUIZ, [img4()], ia)
        self.assertEqual(sel["status"], "conflict")
        self.assertIsNone(sel["modelId"])
        self.assertEqual(before, self.snap(WHEEL, ia))
        r = catalog.route_game(req(use=False, kinds=["hands"], desc="vòng quay chọn tên học sinh"), default_catalog([HANDS]))
        self.assertEqual((r["mode"], r["playerId"]), ("reuse_existing", 2))
        self.assertEqual(r["selection"]["status"], "not_needed")

    def test_c03_21_optional_does_not_steal(self):
        man = man_of([("X", False, ["action"]), ("A", True, ["action"])])
        m = model(5, "image", out(("x", "action")))
        before = self.snap(man, m)
        self.assertEqual(catalog.auto_mapping(man, m), {"A": "x"})
        self.assertTrue(catalog.validate_mapping(man, m, {"A": "x"})["ok"])
        sel = catalog.select_model(man, [m], req()["interaction"])
        self.assertEqual(sel["status"], "selected")
        self.assertEqual(sel["mapping"], {"A": "x"})
        self.assertEqual(before, self.snap(man, m))

    def test_c03_22_augmenting(self):
        man = man_of([("A", True, ["action", "rest"]), ("B", True, ["action"])])
        m = model(5, "image", out(("act", "action"), ("rst", "rest")))
        before = self.snap(man, m)
        self.assertEqual(catalog.auto_mapping(man, m), {"A": "rst", "B": "act"})
        self.assertTrue(catalog.validate_mapping(man, m, {"A": "rst", "B": "act"})["ok"])
        self.assertEqual(before, self.snap(man, m))

    def test_c03_23_key_preference(self):
        man = man_of([("A", True, ["action"]), ("B", True, ["action"])])
        m = model(5, "image", out(("b", "action"), ("a", "action")))
        self.assertEqual(catalog.auto_mapping(man, m), {"A": "a", "B": "b"})

    def test_c03_24_not_enough_layers(self):
        man = man_of([("A", True, ["action"]), ("B", True, ["action"]), ("C", True, ["action"])])
        m = model(5, "image", out(("p", "action"), ("q", "action")))
        before = self.snap(man, m)
        sel = catalog.select_model(man, [m], req()["interaction"])
        self.assertEqual(sel["status"], "conflict")
        self.assertIn("incompatible_model", codes(sel))
        self.assertIsNone(sel["modelId"])
        text = sel["reason"] + " ".join(c["message"] for c in sel["conflicts"])
        self.assertIn("2", text)
        self.assertIn("3", text)
        mp = catalog.auto_mapping(man, m)
        self.assertTrue(set(mp.values()) <= {"p", "q"})
        self.assertEqual(len(set(mp.values())), len(mp))
        self.assertEqual(before, self.snap(man, m))

    def test_property_matching_vs_bruteforce(self):
        import random
        rnd = random.Random(20240601)
        roles = ["action", "rest", "empty"]
        for n in range(400):
            ins = []
            for i in range(rnd.randint(1, 4)):
                acc = rnd.sample(roles, rnd.randint(1, 3))
                ins.append(("k%d" % i if rnd.random() < 0.5 else "L%d" % i, rnd.random() < 0.7, acc))
            keys = [x[0] for x in ins]
            outs = []
            for j in range(rnd.randint(0, 4)):
                key = rnd.choice(keys).lower() if rnd.random() < 0.5 else "o%d" % j
                if key in [o[0] for o in outs]:
                    key = "o%d" % j
                outs.append((key, rnd.choice(roles)))
            man = man_of(ins)
            m = model(1, "image", out(*outs))
            before = self.snap(man, m)
            mp = catalog.auto_mapping(man, m)
            self.assertEqual(before, self.snap(man, m))
            roles_of = {o["key"]: o["role"] for o in m["outputs"]}
            self.assertEqual(len(set(mp.values())), len(mp), n)
            acc_of = {x["key"]: x for x in man["inputs"]}
            for k, v in mp.items():
                self.assertIn(k, acc_of)
                self.assertIn(v, roles_of)
                self.assertIn(roles_of[v], acc_of[k]["accepts"])
            got = sum(1 for k in mp if acc_of[k]["required"])
            self.assertEqual(got, brute_required(man, m), (n, ins, outs, mp))
            self.assertEqual(catalog.validate_mapping(man, m, mp)["ok"], got == sum(1 for x in man["inputs"] if x["required"]), n)


class DbTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp = tempfile.mkdtemp(prefix="ailab_c03_")
        cls._old_db = store.DB_PATH
        cls._old_env = os.environ.get("AILAB_DB")
        os.environ["AILAB_DB"] = os.path.join(cls.tmp, "t.db")
        store.DB_PATH = os.path.join(cls.tmp, "t.db")
        store.init("adminpass123")
        c = store.connect()
        cls.a_id = store.register(c, "usera", "password123")
        cls.b_id = store.register(c, "userb", "password123")
        now = time.time()

        def ins_player(owner, name, status, vis, man=QUIZ):
            cur = c.execute("INSERT INTO players(owner_id,name,description,html,manifest,status,source,visibility,created,updated) "
                            "VALUES(?,?,?,?,?,?, 'upload',?,?,?)", (owner, name, "", "<html>SECRET_HTML</html>", json.dumps(man), status, vis, now, now))
            return cur.lastrowid

        cls.p_a_draft = ins_player(cls.a_id, "PlayerNhapCuaA", "draft", "private")
        cls.p_hidden = ins_player(None, "PlayerAn", "hidden", "public")
        cls.p_b_ok = ins_player(cls.b_id, "PlayerCongKhaiB", "approved", "public")

        def ins_model(owner, name, kind, vis, outs):
            cur = c.execute("INSERT INTO models(owner_id,name,description,kind,url,outputs,visibility,created) VALUES(?,?,?,?,?,?,?,?)",
                            (owner, name, "", kind, "https://example.invalid/SECRET_URL/", json.dumps(outs), vis, now))
            return cur.lastrowid

        o4 = out(("A", "action"), ("B", "action"), ("C", "action"), ("D", "action"))
        cls.m_a_priv = ins_model(cls.a_id, "ModelRiengA", "image", "private", o4)
        cls.m_pub = ins_model(cls.b_id, "ModelCongKhai4", "image", "public", o4)
        c.commit()
        cls.c = c
        rows = {u["username"]: u for u in c.execute("SELECT * FROM users")}
        cls.admin, cls.ua, cls.ub = rows["admin"], rows["usera"], rows["userb"]

    @classmethod
    def tearDownClass(cls):
        cls.c.close()
        store.DB_PATH = cls._old_db
        if cls._old_env is None:
            os.environ.pop("AILAB_DB", None)
        else:
            os.environ["AILAB_DB"] = cls._old_env
        shutil.rmtree(cls.tmp, True)

    def ids(self, user):
        cat = catalog.load_catalog(self.c, user)
        return cat, {p["id"] for p in cat["players"]}, {m["id"] for m in cat["models"]}

    def test_c03_01_load_catalog_visibility(self):
        _, pa, ma = self.ids(self.ua)
        self.assertIn(self.p_a_draft, pa)
        self.assertNotIn(self.p_hidden, pa)
        self.assertIn(self.m_a_priv, ma)
        self.assertIn(self.m_pub, ma)
        _, pb, mb = self.ids(self.ub)
        self.assertNotIn(self.p_a_draft, pb)
        self.assertNotIn(self.p_hidden, pb)
        self.assertNotIn(self.m_a_priv, mb)
        self.assertIn(self.p_b_ok, pb)
        _, pad, mad = self.ids(self.admin)
        self.assertIn(self.p_a_draft, pad)
        self.assertIn(self.p_hidden, pad)
        self.assertIn(self.m_a_priv, mad)
        for user in (self.admin, self.ua, self.ub):
            cat = catalog.load_catalog(self.c, user)
            raw = json.dumps(cat, ensure_ascii=False)
            self.assertNotIn("SECRET_HTML", raw)
            self.assertNotIn("SECRET_URL", raw)
            for p in cat["players"]:
                self.assertTrue({"id", "name", "description", "ownerId", "mine", "sample", "status", "visibility", "manifest"} <= set(p))
                for k in ("html", "url", "flags"):
                    self.assertNotIn(k, p)
            for m in cat["models"]:
                for k in ("html", "url"):
                    self.assertNotIn(k, m)
            self.assertEqual([p["id"] for p in cat["players"]], sorted(p["id"] for p in cat["players"]))
            self.assertEqual([m["id"] for m in cat["models"]], sorted(m["id"] for m in cat["models"]))
        cat = catalog.load_catalog(self.c, self.ua)
        self.assertTrue(next(m for m in cat["models"] if m["id"] == self.m_a_priv)["mine"])
        self.assertTrue(next(p for p in cat["players"] if p["id"] == self.p_a_draft)["mine"])

    def test_c03_01b_no_write(self):
        before = self.c.total_changes
        catalog.load_catalog(self.c, self.ua)
        self.assertEqual(before, self.c.total_changes)

    def test_c03_03_selected_passes_clean_app(self):
        cat = catalog.load_catalog(self.c, self.ub)
        r = catalog.route_game(req(desc="trắc nghiệm ABCD", use=True), cat)
        self.assertEqual(r["mode"], "reuse_existing")
        sel = r["selection"]
        self.assertEqual(sel["status"], "selected")
        self.assertEqual(sel["modelId"], self.m_pub)
        d = {"name": "App thử", "playerId": r["playerId"], "modelId": sel["modelId"], "mapping": sel["mapping"],
             "content": "1+1 | 1 | 2 | =B"}
        res = store.clean_app(self.c, self.ub, d)  # không ném Err
        self.assertEqual(res[2], r["playerId"])
        self.assertEqual(res[3], sel["modelId"])
        self.assertEqual(res[4], sel["mapping"])

    def test_route_forbidden_with_real_catalog(self):
        cat = catalog.load_catalog(self.c, self.ub)
        r = catalog.route_game(req(pid=self.p_a_draft), cat)  # riêng tư của A, B không thấy
        self.assertIsNone(r["mode"])
        self.assertIsNone(r["playerId"])
        self.assertEqual(r["conflicts"][0]["code"], "forbidden_resource")
        r2 = catalog.route_game(req(pid=987654), cat)
        self.assertEqual(r["conflicts"][0]["message"], r2["conflicts"][0]["message"])
        self.assertNotIn("PlayerNhapCuaA", json.dumps(r, ensure_ascii=False))
        q = next(p for p in cat["players"] if p["manifest"].get("inputs") and p["sample"])
        r3 = catalog.route_game(req(pid=q["id"], use=False), cat)
        self.assertEqual(r3["playerId"], q["id"])  # giữ playerId giáo viên chọn dù conflict

    def test_c03_22_clean_app_real(self):
        man = man_of([("A", True, ["action", "rest"]), ("B", True, ["action"])])
        now = time.time()
        pid = self.c.execute("INSERT INTO players(owner_id,name,description,html,manifest,status,source,visibility,created,updated) "
                             "VALUES(?,?,?,?,?,'draft','upload','private',?,?)",
                             (self.ub["id"], "CamMin", "", "<html></html>", json.dumps(man), now, now)).lastrowid
        mid = self.c.execute("INSERT INTO models(owner_id,name,description,kind,url,outputs,visibility,created) VALUES(?,?,?,?,?,?,?,?)",
                             (self.ub["id"], "M2", "", "image", "https://example.invalid/m/", json.dumps(out(("act", "action"), ("rst", "rest"))), "private", now)).lastrowid
        self.c.commit()
        cat = catalog.load_catalog(self.c, self.ub)
        mdl = next(m for m in cat["models"] if m["id"] == mid)
        sel = catalog.select_model(man, [mdl], req()["interaction"])
        self.assertEqual(sel["status"], "selected")
        self.assertEqual(sel["mapping"], {"A": "rst", "B": "act"})
        res = store.clean_app(self.c, self.ub, {"name": "x", "playerId": pid, "modelId": mid, "mapping": sel["mapping"]})
        self.assertEqual(res[4], sel["mapping"])


if __name__ == "__main__":
    unittest.main()
