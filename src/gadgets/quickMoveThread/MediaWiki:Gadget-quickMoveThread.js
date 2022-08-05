// <pre>
"use strict";
$(() => {
    try {
        const NS = mw.config.get("wgNamespaceNumber");
        if (NS > 0 && !(NS & 1)) {
            return;
        }

        const PAGENAME = mw.config.get("wgPageName");
        const PUBLICDB = ["技术实现", "权限变更", "操作申请", "方针政策", "页面相关", "提问求助", "群组信息"].filter(
            (v) => PAGENAME.substring(PAGENAME.lastIndexOf("/") + 1, PAGENAME.length) !== v,
        );

        const $body = $("body");
        $("#mw-notification-area").appendTo($body);

        class QMTWindow extends OO.ui.ProcessDialog {
            static static = $.extend(Object.create(super.static), {
                name: "lr-qmt",
                title: wgULS("快速移动讨论串", "快速移動討論串"),
                actions: [
                    {
                        action: "cancel",
                        label: "取消",
                        flags: ["safe", "close", "destructive"],
                    },
                    {
                        action: "submit",
                        label: wgULS("确认", "確認"),
                        flags: ["primary", "progressive"],
                    },
                ],
            });
            constructor(config) {
                // Parent constructor
                super(config);

                this.storage = config.data.storage;
            }
            initialize() {
                // Parent method
                super.initialize();

                this.panelLayout = new OO.ui.PanelLayout({
                    scrollable: false,
                    expanded: false,
                    padded: true,
                });
                this.targetDropdown = new OO.ui.DropdownInputWidget({
                    options: [
                        ...PUBLICDB.map((v) => ({
                            data: `萌娘百科_talk:讨论版/${v}`,
                            label: `${v}版`,
                        })),
                        {
                            data: "",
                            label: "其他",
                        },
                    ],
                });
                this.targetText = new OO.ui.TextInputWidget({
                    value: PAGENAME,
                });
                this.enterCheckbox = new OO.ui.CheckboxInputWidget({
                    selected: this.storage.getItem("submit-on-enter"),
                });

                this.targetDropdownMenu = this.targetDropdown.dropdownWidget.getMenu();

                const targetDropdownField = new OO.ui.FieldLayout(this.targetDropdown, {
                    label: wgULS("目标页面", "目標頁面"),
                    align: "top",
                });
                const targetTextField = new OO.ui.FieldLayout(this.targetText, {
                    label: wgULS("页面名", "頁面名"),
                    align: "top",
                });
                const enterField = new OO.ui.FieldLayout(this.enterCheckbox, {
                    label: wgULS("按回车键提交（浏览器级设置）", "按回車鍵提交（瀏覽器級設置）"),
                    align: "inline",
                });

                this.needToggle = $([targetTextField.$element[0], enterField.$element[0]]);

                this.panelLayout.$element.append([
                    targetDropdownField.$element,
                    targetTextField.$element,
                    enterField.$element,
                ]);

                this.targetDropdownMenu.connect(this, { toggle: "dropdownToggle" });
                this.targetDropdown.connect(this, { change: "showTextInput" });
                this.targetText.connect(this, { enter: "onEnter" });
                this.enterCheckbox.connect(this, { change: "setStorage" });

                this.$body.append(this.panelLayout.$element);
            }
            dropdownToggle(visible) {
                if (visible) {
                    // Manually resize
                    // TODO: make this animated
                    const newHeight = parseFloat(this.$frame.css("height")) + 200;
                    this.withoutSizeTransitions(() => {
                        this.$frame.css("height", newHeight);
                        this.targetDropdownMenu.clip();
                    });
                } else {
                    this.updateSize();
                }
            }
            showTextInput(value) {
                if (value) {
                    this.needToggle.slideUp("fast", () => this.updateSize());
                } else {
                    this.needToggle.slideDown("fast", () => this.updateSize());
                }
            }
            setStorage(selected) {
                this.storage.setItem("submit-on-enter", selected);
            }
            onEnter() {
                if (this.enterCheckbox.isSelected()) {
                    this.executeAction("submit");
                }
            }
            getBodyHeight() {
                return this.panelLayout.$element.outerHeight(true);
            }
            getReadyProcess(data) {
                return super.getReadyProcess(data).next(() => {
                    this.targetText.trigger("focus");
                }, this);
            }
            getSetupProcess(data) {
                return super.getSetupProcess(data).next(() => {
                    this.section = data.section;
                    this.anchor = data.anchor;
                }, this);
            }
            getActionProcess(action) {
                const dfd = $.Deferred();
                if (action === "cancel") {
                    return new OO.ui.Process(() => {
                        this.close({ action });
                    }, this);
                } else if (action === "submit") {
                    return new OO.ui.Process(() => {
                        this.target = this.targetDropdown.getValue() || this.targetText.getValue();
                        if (!this.target) {
                            dfd.reject(new OO.ui.Error(wgULS("请填写目标页面", "請填寫目標頁面")));
                            return dfd.promise();
                        }
                        if (this.target === PAGENAME) {
                            dfd.reject(new OO.ui.Error(wgULS("目标页面不得与当前页面相同", "目標頁面不得與當前頁面相同")));
                            return dfd.promise();
                        }
                        this.doMove().then(() => {
                            this.close({ action });
                            mw.notify(wgULS("即将刷新……", "即將刷新……"), {
                                title: wgULS("移动成功", "移動成功"),
                                type: "success",
                                tag: "lr-qmt",
                            });
                            dfd.resolve();
                            setTimeout(() => location.reload(), 730);
                        }).catch((e) => {
                            console.error("[QuickMoveThread] Error:", e);
                            dfd.reject(new OO.ui.Error(e));
                        });
                        return dfd.promise();
                    }, this);
                }
                // Fallback to parent handler
                return super.getActionProcess(action);
            }
            async doMove() {
                const api = new mw.Api();
                const fromAnchor = `${PAGENAME}#${this.anchor}`;
                const toAnchor = `${this.target}#${this.anchor}`;

                let original = (await api.get({
                    action: "parse",
                    page: PAGENAME,
                    prop: "wikitext",
                    section: this.section,
                })).parse.wikitext["*"];
                const rawTitle = original.match(/^== *([^=\n]+) *==/m)?.[1] || this.anchor;
                original = original.replace(/^==.*?==/, "").trim();
                original = `{{movedfrom|${fromAnchor}}}\n\n${original}`;

                // Move to target
                console.log("[QuickMoveThread] Moving thread to target page");
                await api.postWithToken("csrf", {
                    action: "edit",
                    title: this.target,
                    section: "new",
                    sectiontitle: rawTitle,
                    text: original,
                    summary: `/* ${this.anchor} */ 移动讨论串自[[${fromAnchor}]]`,
                    tags: "Automation tool",
                });

                // Remove original
                console.log("[QuickMoveThread] Removing original thread");
                await api.postWithToken("csrf", {
                    action: "edit",
                    title: PAGENAME,
                    section: this.section,
                    text: `== ${rawTitle} ==\n{{movedto|${toAnchor}}}`,
                    summary: `/* ${this.anchor} */ 移动讨论串至[[${toAnchor}]]`,
                    tags: "Automation tool",
                });
            }
        }

        const storage = new LocalObjectStorage("lr-qmt");

        const windowManager = new OO.ui.WindowManager();
        $body.append(windowManager.$element);
        const qmtDialog = new QMTWindow({
            size: "medium",
            data: { storage },
        });
        windowManager.addWindows([qmtDialog]);

        $(".mw-parser-output h2").each((_, ele) => {
            const $ele = $(ele);
            if (!$ele.find(".mw-editsection")[0] || $ele.next(".movedToNotice, .movedFromNotice, .saveNotice")[0]) {
                return;
            }
            const section = +new mw.Uri($ele.find('.mw-editsection a[href*="action=edit"][href*="section="]').attr("href")).query.section;
            const anchor = $ele.find(".mw-headline").attr("id");
            const button = $("<a>").attr("href", "#").prop("draggable", false).addClass("lr-qmt-link").text(wgULS("移动", "移動")).on("click", (e) => {
                e.preventDefault();
                windowManager.openWindow(qmtDialog, { section, anchor });
            });
            $ele.find(".mw-editsection-bracket").first().after('<span class="mw-editsection-divider"> | </span>').after(button); // 
        });
    } catch (e) {
        /* eslint-disable */
        var parseError = function (errLike, space) {
            if (space === void 0) { space = 4; }
            return JSON.stringify(errLike, function (_, v) {
                if (v instanceof Error) {
                    var stack = [];
                    if (v.stack) {
                        stack.push.apply(stack, v.stack.split("\n").map(function (n) { return n.trim(); }).filter(function (n) { var _a; return ((_a = n === null || n === void 0 ? void 0 : n.length) !== null && _a !== void 0 ? _a : -1) > 0; }));
                    }
                    var keys = Object.keys(v).filter(function (key) { return !(key in Error.prototype); });
                    if (keys.length) {
                        stack.push(JSON.stringify(Object.fromEntries(keys.map(function (key) { return [key, v[key]]; })), null, space));
                    }
                    return stack.join("\n").trim() || "";
                }
                return v;
            }, space).replace(/^"(.*)"$/, "$1");
        };
        oouiDialog.alert("错误信息：<br>" + oouiDialog.sanitize(parseError(e)), {
            title: "快速移动工具发生错误"
        });
        console.error("[QuickMoveThread] Setup error:", e);
        /* eslint-enable */
    }
});
// </pre>