import { useEffect, useMemo, useState } from "react";
import {
    Boxes,
    Building2,
    ClipboardList,
    Info,
    PackageSearch,
    PackagePlus,
    Search,
    TrendingUp,
    Warehouse,
    X,
} from "lucide-react";
import DashboardLayout from "../layouts/DashboardLayout";
import StockTransferTimeline from "../components/StockTransferTimeline";

const API = "http://localhost:5000";
const DEFAULT_REORDER_LEVEL = 10;
const SAFETY_STOCK_MULTIPLIER = 1.2;
const ROWS_PER_PAGE = 5;
const ACTIVE_TRANSFER_STATUSES = ["PENDING", "PENDING_SOURCE", "APPROVED"];
const HEATMAP_STATUSES = ["OUT_OF_STOCK", "LOW_STOCK", "WATCH", "HEALTHY"];

export default function InventoryOverview() {
    const user = JSON.parse(sessionStorage.getItem("user")) || {};

    const [inventory, setInventory] = useState([]);
    const [branches, setBranches] = useState([]);
    const [products, setProducts] = useState([]);
    const [forecasts, setForecasts] = useState([]);
    const [stockTransferRecords, setStockTransferRecords] = useState([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState("");
    const [branchFilter, setBranchFilter] = useState("ALL");
    const [stockFilter, setStockFilter] = useState("ALL");
    const [stockPage, setStockPage] = useState(1);
    const [transferPage, setTransferPage] = useState(1);
    const [aiPage, setAiPage] = useState(1);

    const [selectedProduct, setSelectedProduct] = useState(null);
    const [selectedRecommendation, setSelectedRecommendation] = useState(null);
    const [selectedTransferDetails, setSelectedTransferDetails] = useState(null);
    const [arrangeTransferItem, setArrangeTransferItem] = useState(null);
    const [arrangeTransferForm, setArrangeTransferForm] = useState({
        source_branch_id: "",
        quantity: "",
    });
    const [arrangingTransfer, setArrangingTransfer] = useState(false);
    const [transferDetailLoading, setTransferDetailLoading] = useState(null);
    const [updatingReorderProductId, setUpdatingReorderProductId] = useState(null);
    const [toast, setToast] = useState(null);

    const showToast = (message, type = "success") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 2500);
    };

    const fetchData = async () => {
        try {
            setLoading(true);

            const [inventoryRes, branchesRes, productsRes, forecastRes, transferRecordRes] =
                await Promise.allSettled([
                    fetch(`${API}/admin/inventory`, { credentials: "include" }),
                    fetch(`${API}/admin/branches`, { credentials: "include" }),
                    fetch(`${API}/admin/products`, { credentials: "include" }),
                    fetch(`${API}/admin/forecast/products`, { credentials: "include" }),
                    fetch(`${API}/admin/stock-transfers/records`, { credentials: "include" }),
                ]);

            setInventory(await readArrayResponse(inventoryRes));
            setBranches(await readArrayResponse(branchesRes));
            setProducts(await readArrayResponse(productsRes));

            if (forecastRes.status === "fulfilled" && forecastRes.value.ok) {
                const forecastData = await forecastRes.value.json();
                setForecasts(Array.isArray(forecastData.forecasts) ? forecastData.forecasts : []);
            } else {
                setForecasts([]);
            }

            setStockTransferRecords(await readArrayResponse(transferRecordRes));
        } catch (err) {
            console.error("Inventory overview error:", err);
            showToast("Failed to load inventory overview data.", "error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    useEffect(() => {
        setStockPage(1);
        setTransferPage(1);
        setAiPage(1);
    }, [search, branchFilter, stockFilter]);

    const productMap = useMemo(() => {
        const map = {};
        products.forEach((product) => {
            map[Number(product.product_id)] = product;
        });
        return map;
    }, [products]);

    const branchTypeMap = useMemo(() => {
        const map = {};
        branches.forEach((branch) => {
            map[Number(branch.branch_id)] = branch.branch_type || "BRANCH";
        });
        return map;
    }, [branches]);

    const forecastMap = useMemo(() => {
        const map = {};
        forecasts.forEach((item) => {
            map[Number(item.product_id)] = item;
        });
        return map;
    }, [forecasts]);

    const stockRows = useMemo(() => {
        return inventory.map((item) => {
            const product = productMap[Number(item.product_id)];
            const quantity = Number(item.quantity_in_stock || 0);
            const branchType =
                branchTypeMap[Number(item.branch_id)] || item.branch_type || "BRANCH";
            const reorderLevel = Number(
                branchType === "WAREHOUSE"
                    ? product?.warehouse_reorder_level ?? product?.reorder_level ?? item.reorder_level ?? DEFAULT_REORDER_LEVEL
                    : product?.reorder_level ?? item.reorder_level ?? DEFAULT_REORDER_LEVEL
            );

            let status = "HEALTHY";
            if (quantity === 0) status = "OUT_OF_STOCK";
            else if (quantity <= reorderLevel) status = "LOW_STOCK";

            return {
                ...item,
                product_code: item.product_code || product?.product_code,
                product_name: item.product_name || product?.product_name,
                category_name: item.category_name || product?.category_name,
                branch_type: branchType,
                reorder_level: reorderLevel,
                stock_status: status,
            };
        });
    }, [inventory, branchTypeMap, productMap]);

    const branchOptions = useMemo(() => {
        const names = new Set();
        stockRows.forEach((item) => {
            if (item.branch_type !== "WAREHOUSE" && item.branch_name) {
                names.add(item.branch_name);
            }
        });
        branches.forEach((branch) => {
            if (branch.branch_type !== "WAREHOUSE" && branch.branch_name) {
                names.add(branch.branch_name);
            }
        });
        return ["ALL", ...names];
    }, [stockRows, branches]);

    const activeBranchCount = useMemo(() => {
        const branchIds = new Set();
        branches.forEach((branch) => {
            if (branch.branch_type !== "WAREHOUSE") {
                branchIds.add(Number(branch.branch_id));
            }
        });
        return Math.max(1, branchIds.size);
    }, [branches]);

    const filteredStockRows = useMemo(() => {
        const keyword = search.trim().toLowerCase();

        return stockRows.filter((item) => {
            if (item.branch_type === "WAREHOUSE") return false;

            const matchesSearch =
                !keyword ||
                item.product_code?.toLowerCase().includes(keyword) ||
                item.product_name?.toLowerCase().includes(keyword) ||
                item.category_name?.toLowerCase().includes(keyword) ||
                item.branch_name?.toLowerCase().includes(keyword);
            const matchesBranch =
                branchFilter === "ALL" ||
                item.branch_name === branchFilter;
            const matchesStatus =
                stockFilter === "ALL" || item.stock_status === stockFilter;

            return matchesSearch && matchesBranch && matchesStatus;
        });
    }, [stockRows, search, branchFilter, stockFilter]);

    const heatmapLocations = useMemo(() => {
        const map = {};

        branches.forEach((branch) => {
            const branchId = Number(branch.branch_id);
            map[branchId] = {
                branch_id: branchId,
                branch_name: branch.branch_name || "Unknown Location",
                branch_type: branch.branch_type || "BRANCH",
            };
        });

        stockRows.forEach((item) => {
            const branchId = Number(item.branch_id);
            if (!map[branchId]) {
                map[branchId] = {
                    branch_id: branchId,
                    branch_name: item.branch_name || "Unknown Location",
                    branch_type: item.branch_type || "BRANCH",
                };
            }
        });

        return Object.values(map).sort(sortLocations);
    }, [branches, stockRows]);

    const inventoryHeatmap = useMemo(() => {
        const keyword = search.trim().toLowerCase();
        const locationFilter = branchFilter === "ALL"
            ? heatmapLocations
            : heatmapLocations.filter((location) => location.branch_name === branchFilter);
        const locationIds = new Set(locationFilter.map((location) => Number(location.branch_id)));
        const productRows = {};
        const summary = HEATMAP_STATUSES.reduce((acc, status) => {
            acc[status] = 0;
            return acc;
        }, {});

        stockRows.forEach((item) => {
            const productId = Number(item.product_id);
            const branchId = Number(item.branch_id);
            if (!locationIds.has(branchId)) return;

            const productMatches =
                !keyword ||
                item.product_code?.toLowerCase().includes(keyword) ||
                item.product_name?.toLowerCase().includes(keyword) ||
                item.category_name?.toLowerCase().includes(keyword);
            const locationMatches =
                !keyword ||
                item.branch_name?.toLowerCase().includes(keyword);

            if (!productMatches && !locationMatches) return;

            const quantity = Number(item.quantity_in_stock || 0);
            const reorderLevel = Number(item.reorder_level || DEFAULT_REORDER_LEVEL);
            const heatmapStatus = getHeatmapStatus(quantity, reorderLevel);
            const matchesStatus =
                stockFilter === "ALL" ||
                item.stock_status === stockFilter ||
                heatmapStatus === stockFilter;

            if (!matchesStatus) return;

            if (!productRows[productId]) {
                productRows[productId] = {
                    product_id: productId,
                    product_code: item.product_code,
                    product_name: item.product_name,
                    category_name: item.category_name,
                    cells: {},
                };
            }

            productRows[productId].cells[branchId] = {
                quantity,
                reorder_level: reorderLevel,
                status: heatmapStatus,
            };
            summary[heatmapStatus] += 1;
        });

        return {
            locations: locationFilter,
            products: Object.values(productRows).sort(
                (a, b) => a.product_name?.localeCompare(b.product_name || "") || 0
            ),
            summary,
        };
    }, [stockRows, heatmapLocations, search, branchFilter, stockFilter]);

    const productDistribution = useMemo(() => {
        const map = {};

        stockRows.forEach((item) => {
            const productId = Number(item.product_id);
            const product = productMap[productId];
            if (!map[productId]) {
                map[productId] = {
                    product_id: productId,
                    product_code: item.product_code,
                    product_name: item.product_name,
                    category_name: item.category_name,
                    reorder_level: Number(
                        product?.reorder_level ?? item.reorder_level ?? DEFAULT_REORDER_LEVEL
                    ),
                    warehouse_reorder_level: Number(
                        product?.warehouse_reorder_level ??
                            product?.reorder_level ??
                            item.reorder_level ??
                            DEFAULT_REORDER_LEVEL
                    ),
                    totalStock: 0,
                    branchStock: 0,
                    warehouseStock: 0,
                    branchLocationCount: 0,
                    locations: [],
                };
            }

            const quantity = Number(item.quantity_in_stock || 0);
            map[productId].totalStock += quantity;

            if (item.branch_type === "WAREHOUSE") {
                map[productId].warehouseStock += quantity;
            } else {
                map[productId].branchStock += quantity;
                map[productId].branchLocationCount += 1;
            }

            map[productId].locations.push({
                branch_name: item.branch_name || "Unknown Location",
                branch_type: item.branch_type,
                quantity,
            });
        });

        return map;
    }, [stockRows, productMap]);

    const aiRecommendations = useMemo(() => {
        return Object.values(productDistribution)
            .map((product) => {
                const forecast = forecastMap[Number(product.product_id)];
                const forecastDemand = Number(forecast?.forecast_quantity || 0);
                const branchCount = Math.max(
                    1,
                    Number(product.branchLocationCount || activeBranchCount)
                );
                const branchForecastDemand = forecastDemand > 0 ? forecastDemand / branchCount : 0;
                const recentSales = getRecentMonthlySales(forecast?.monthly_sales);
                const recentSalesStats = getRecentSalesStats(recentSales);
                const recommendedReorderLevel =
                    forecastDemand > 0
                        ? Math.ceil(branchForecastDemand * SAFETY_STOCK_MULTIPLIER)
                        : Number(product.reorder_level || DEFAULT_REORDER_LEVEL);
                const recommendation = getReorderRecommendation(
                    product.reorder_level,
                    recommendedReorderLevel
                );

                return {
                    ...product,
                    forecastDemand,
                    branchForecastDemand,
                    branchCount,
                    recentSales,
                    recentSalesStats,
                    recommendedReorderLevel,
                    recommendation,
                    modelName: forecast?.selected_model || "-",
                    forecastMonth: forecast?.forecast_month,
                    reason: buildReorderReason({
                        currentLevel: product.reorder_level,
                        recommendedLevel: recommendedReorderLevel,
                        forecastDemand,
                        branchForecastDemand,
                        branchCount,
                        recommendation,
                        recentSalesStats,
                    }),
                };
            })
            .sort((a, b) => a.product_name?.localeCompare(b.product_name || "") || 0);
    }, [productDistribution, forecastMap, activeBranchCount]);

    const paginatedStockRows = paginate(filteredStockRows, stockPage);
    const paginatedStockTransferRecords = paginate(stockTransferRecords, transferPage);
    const paginatedAi = paginate(aiRecommendations, aiPage);

    const totalStock = stockRows.reduce(
        (sum, item) => sum + Number(item.quantity_in_stock || 0),
        0
    );
    const warehouseStock = stockRows
        .filter((item) => item.branch_type === "WAREHOUSE")
        .reduce((sum, item) => sum + Number(item.quantity_in_stock || 0), 0);
    const branchStock = totalStock - warehouseStock;

    const openProductDistribution = (item) => {
        setSelectedProduct(productDistribution[Number(item.product_id)] || null);
    };

    const openArrangeTransfer = (item) => {
        if (hasOpenTransferRequest(item)) {
            showToast(
                `Stock transfer ${item.active_transfer_code || `#${item.active_transfer_id}`} already exists for this product and branch.`,
                "error"
            );
            return;
        }

        const suggestedQuantity = Math.max(
            Number(item.reorder_level || 0) - Number(item.quantity_in_stock || 0),
            1
        );
        setArrangeTransferItem(item);
        setArrangeTransferForm({
            source_branch_id: "",
            quantity: String(suggestedQuantity),
        });
    };

    const arrangeSourceOptions = useMemo(() => {
        if (!arrangeTransferItem) return [];

        return stockRows
            .filter((item) =>
                Number(item.product_id) === Number(arrangeTransferItem.product_id) &&
                Number(item.branch_id) !== Number(arrangeTransferItem.branch_id) &&
                Number(item.quantity_in_stock || 0) > 0
            )
            .sort((a, b) => {
                if (a.branch_type !== b.branch_type) {
                    return a.branch_type === "WAREHOUSE" ? -1 : 1;
                }
                return Number(b.quantity_in_stock || 0) - Number(a.quantity_in_stock || 0);
            });
    }, [arrangeTransferItem, stockRows]);

    const selectedArrangeSource = arrangeSourceOptions.find(
        (item) => Number(item.branch_id) === Number(arrangeTransferForm.source_branch_id)
    );

    const submitArrangeTransfer = async () => {
        if (!arrangeTransferItem) return;

        if (hasOpenTransferRequest(arrangeTransferItem)) {
            showToast(
                `Stock transfer ${arrangeTransferItem.active_transfer_code || `#${arrangeTransferItem.active_transfer_id}`} already exists for this product and branch.`,
                "error"
            );
            setArrangeTransferItem(null);
            return;
        }

        if (!arrangeTransferForm.source_branch_id) {
            showToast("Select a source location.", "error");
            return;
        }

        const quantity = Number(arrangeTransferForm.quantity);
        if (!quantity || quantity <= 0) {
            showToast("Quantity must be greater than 0.", "error");
            return;
        }

        if (selectedArrangeSource && quantity > Number(selectedArrangeSource.quantity_in_stock || 0)) {
            showToast("Quantity cannot exceed source stock.", "error");
            return;
        }

        const sourceType = selectedArrangeSource?.branch_type;
        const path = sourceType === "WAREHOUSE"
            ? "/admin/warehouse/distribute"
            : "/admin/stock-transfer/request";

        const payload = sourceType === "WAREHOUSE"
            ? {
                  from_branch_id: Number(arrangeTransferForm.source_branch_id),
                  to_branch_id: Number(arrangeTransferItem.branch_id),
                  product_id: Number(arrangeTransferItem.product_id),
                  quantity,
                  approved_by: Number(user.user_id),
              }
            : {
                  from_branch_id: Number(arrangeTransferForm.source_branch_id),
                  to_branch_id: Number(arrangeTransferItem.branch_id),
                  requested_by: Number(user.user_id),
                  items: [{
                      product_id: Number(arrangeTransferItem.product_id),
                      quantity,
                  }],
              };

        try {
            setArrangingTransfer(true);
            const res = await fetch(`${API}${path}`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await res.json().catch(() => ({}));

            if (!res.ok) {
                showToast(data.message || "Failed to arrange stock transfer.", "error");
                return;
            }

            setArrangeTransferItem(null);
            setArrangeTransferForm({ source_branch_id: "", quantity: "" });
            showToast(data.message || "Stock transfer arranged successfully.");
            fetchData();
        } catch (error) {
            console.error(error);
            showToast("Failed to arrange stock transfer.", "error");
        } finally {
            setArrangingTransfer(false);
        }
    };

    const openTransferDetails = async (transferId) => {
        try {
            setTransferDetailLoading(transferId);

            const res = await fetch(`${API}/admin/stock-transfers/${transferId}/details`, {
                credentials: "include",
            });
            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to load stock transfer details.", "error");
                return;
            }

            setSelectedTransferDetails(data);
        } catch (error) {
            console.error(error);
            showToast("Failed to load stock transfer details.", "error");
        } finally {
            setTransferDetailLoading(null);
        }
    };

    const applyRecommendedReorderLevel = async (item) => {
        const productId = Number(item.product_id);
        const recommendedLevel = Math.max(0, Math.floor(Number(item.recommendedReorderLevel)));

        if (!productId || !Number.isFinite(recommendedLevel)) {
            showToast("Unable to apply this reorder recommendation.", "error");
            return;
        }

        try {
            setUpdatingReorderProductId(productId);

            const res = await fetch(`${API}/admin/products/${productId}/reorder-level`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    reorder_level: recommendedLevel,
                    actor_user_id: user.user_id,
                }),
            });
            const data = await res.json();

            if (!res.ok) {
                showToast(data.message || "Failed to update reorder level.", "error");
                return;
            }

            setProducts((prev) =>
                prev.map((product) =>
                    Number(product.product_id) === productId
                        ? { ...product, reorder_level: recommendedLevel }
                        : product
                )
            );
            setInventory((prev) =>
                prev.map((row) =>
                    Number(row.product_id) === productId
                        ? { ...row, reorder_level: recommendedLevel }
                        : row
                )
            );
            setSelectedRecommendation((prev) =>
                prev && Number(prev.product_id) === productId
                    ? {
                          ...prev,
                          reorder_level: recommendedLevel,
                          recommendation: getReorderRecommendation(
                              recommendedLevel,
                              prev.recommendedReorderLevel
                          ),
                      }
                    : prev
            );

            showToast(data.message || "Reorder level updated successfully.");
        } catch (error) {
            console.error(error);
            showToast("Failed to update reorder level.", "error");
        } finally {
            setUpdatingReorderProductId(null);
        }
    };

    return (
        <DashboardLayout
            user={user}
            title="Inventory Overview"
            subtitle="Monitor where stock is located, how it moved, and future reorder level guidance."
            onRefresh={fetchData}
        >
            <div className="space-y-6">
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-4">
                    <SummaryCard
                        title="Total Stock Units"
                        value={totalStock}
                        icon={<Boxes size={20} />}
                        tone="green"
                    />
                    <SummaryCard
                        title="Warehouse Stock"
                        value={warehouseStock}
                        icon={<Warehouse size={20} />}
                        tone="purple"
                    />
                    <SummaryCard
                        title="Branch Stock"
                        value={branchStock}
                        icon={<Building2 size={20} />}
                        tone="blue"
                    />
                    <SummaryCard
                        title="Transfer Records"
                        value={stockTransferRecords.length}
                        icon={<ClipboardList size={20} />}
                        tone="orange"
                    />
                </div>

                <FilterBar
                    search={search}
                    setSearch={setSearch}
                    branchFilter={branchFilter}
                    setBranchFilter={setBranchFilter}
                    stockFilter={stockFilter}
                    setStockFilter={setStockFilter}
                    branchOptions={branchOptions}
                />

                <SectionCard
                    icon={<Boxes size={21} />}
                    title="Branch Stock Overview"
                    desc="Stock quantities across branch locations."
                    badge={`${filteredStockRows.length} records`}
                    badgeTone="blue"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1160px] border-separate border-spacing-0 text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                                <tr className="border-b text-[#6f85a3]">
                                    <th className="border-b py-3 pr-5 text-xs font-extrabold uppercase">Product Code</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Product Name</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Category</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Branch Name</th>
                                    <th className="border-b px-5 text-right text-xs font-extrabold uppercase">Current Quantity</th>
                                    <th className="border-b px-5 text-right text-xs font-extrabold uppercase">Reorder Level</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Status</th>
                                    <th className="border-b pl-5 text-right text-xs font-extrabold uppercase">Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <EmptyRow colSpan={8} text="Loading inventory quantities..." />
                                ) : paginatedStockRows.length === 0 ? (
                                    <EmptyRow colSpan={8} text="No branch stock records found." />
                                ) : (
                                    paginatedStockRows.map((item) => (
                                        <tr
                                            key={`stock-${item.product_id}-${item.branch_id}`}
                                            className="border-b last:border-none hover:bg-[#f8fcff]"
                                        >
                                            <td className="border-b border-blue-50 py-4 pr-5 text-xs font-extrabold uppercase tracking-wide text-[#6f85a3]">
                                                {item.product_code || "-"}
                                            </td>
                                            <td className="border-b border-blue-50 px-5">
                                                <p className="font-extrabold text-[#07102f]">{item.product_name || "-"}</p>
                                            </td>
                                            <td className="border-b border-blue-50 px-5 font-semibold text-[#6f85a3]">
                                                {item.category_name || "-"}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 font-extrabold text-[#17325c]">
                                                {item.branch_name || "-"}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 text-right font-extrabold text-[#07102f]">
                                                {item.quantity_in_stock ?? 0}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 text-right font-extrabold text-[#17325c]">
                                                {item.reorder_level}
                                            </td>
                                            <td className="border-b border-blue-50 px-5">
                                                <StockStatusBadge status={item.stock_status} />
                                            </td>
                                            <td className="border-b border-blue-50 pl-5 text-right">
                                                {item.branch_type !== "WAREHOUSE" && item.stock_status !== "HEALTHY" && hasOpenTransferRequest(item) && (
                                                    <button
                                                        disabled
                                                        className="mr-2 inline-flex h-9 items-center gap-2 rounded-xl bg-amber-50 px-3 text-xs font-extrabold text-amber-700"
                                                        title={`Existing transfer ${item.active_transfer_code || `#${item.active_transfer_id}`} is ${formatStatus(item.active_transfer_status)}`}
                                                    >
                                                        <ClipboardList size={15} />
                                                        Requested
                                                    </button>
                                                )}
                                                {item.branch_type !== "WAREHOUSE" && item.stock_status !== "HEALTHY" && !hasOpenTransferRequest(item) && (
                                                    <button
                                                        onClick={() => openArrangeTransfer(item)}
                                                        className="mr-2 inline-flex h-9 items-center gap-2 rounded-xl bg-[#0c2f73] px-3 text-xs font-extrabold text-white hover:bg-[#103986]"
                                                        title="Arrange stock transfer"
                                                    >
                                                        <PackagePlus size={15} />
                                                        Arrange
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => openProductDistribution(item)}
                                                    className="inline-grid h-9 w-9 place-items-center rounded-xl bg-[#eef6fb] text-[#1e4db7] hover:bg-blue-100"
                                                    title="View product distribution"
                                                >
                                                    <Info size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <Pagination
                        total={filteredStockRows.length}
                        page={stockPage}
                        setPage={setStockPage}
                    />
                </SectionCard>

                <SectionCard
                    icon={<PackageSearch size={21} />}
                    title="Inventory Heatmap"
                    desc="Product stock levels across branch and warehouse locations."
                    badge={`${inventoryHeatmap.products.length} products`}
                    badgeTone="green"
                >
                    <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                        {HEATMAP_STATUSES.map((status) => (
                            <div
                                key={`heatmap-summary-${status}`}
                                className={`rounded-2xl px-4 py-3 ${getHeatmapSummaryStyle(status)}`}
                            >
                                <p className="text-xs font-extrabold uppercase">
                                    {formatHeatmapStatus(status)}
                                </p>
                                <p className="mt-1 text-2xl font-black">
                                    {inventoryHeatmap.summary[status] || 0}
                                </p>
                            </div>
                        ))}
                    </div>

                    <div className="mb-4 flex flex-wrap gap-4">
                        {HEATMAP_STATUSES.map((status) => (
                            <div
                                key={`heatmap-legend-${status}`}
                                className="flex items-center gap-2 text-xs font-bold text-[#17325c]"
                            >
                                <span className={`h-3 w-6 rounded-sm ${getHeatmapLegendStyle(status)}`} />
                                {getHeatmapLegendText(status)}
                            </div>
                        ))}
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[1180px] border-collapse text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                                <tr className="text-[#6f85a3]">
                                    <th className="sticky left-0 z-20 border border-blue-50 bg-white px-4 py-3 text-xs font-extrabold uppercase">
                                        Product
                                    </th>
                                    {inventoryHeatmap.locations.map((location) => (
                                        <th
                                            key={`heatmap-head-${location.branch_id}`}
                                            className="border border-blue-50 bg-[#f8fcff] px-4 py-3 text-center text-xs font-extrabold uppercase"
                                        >
                                            <span className="block text-[#17325c]">
                                                {location.branch_name}
                                            </span>
                                            <span className="mt-1 block text-[11px] text-[#6f85a3]">
                                                {location.branch_type === "WAREHOUSE" ? "Warehouse" : "Branch"}
                                            </span>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <EmptyRow colSpan={inventoryHeatmap.locations.length + 1} text="Loading inventory heatmap..." />
                                ) : inventoryHeatmap.products.length === 0 ? (
                                    <EmptyRow colSpan={inventoryHeatmap.locations.length + 1} text="No heatmap records found." />
                                ) : (
                                    inventoryHeatmap.products.map((product) => (
                                        <tr
                                            key={`heatmap-product-${product.product_id}`}
                                            className="last:border-none"
                                        >
                                            <td className="sticky left-0 z-10 w-[260px] border border-blue-50 bg-white px-4 py-4">
                                                <p className="font-extrabold text-[#07102f]">
                                                    {product.product_name || "-"}
                                                </p>
                                                <p className="text-xs font-bold uppercase text-[#6f85a3]">
                                                    {product.product_code || "-"}
                                                </p>
                                            </td>
                                            {inventoryHeatmap.locations.map((location) => {
                                                const cell = product.cells[Number(location.branch_id)];

                                                return (
                                                    <td
                                                        key={`heatmap-cell-${product.product_id}-${location.branch_id}`}
                                                        className={`h-16 border border-white px-4 py-3 text-center align-middle ${
                                                            cell
                                                                ? getHeatmapCellStyle(cell.status)
                                                                : "bg-slate-50 text-slate-300"
                                                        }`}
                                                        title={
                                                            cell
                                                                ? `${formatHeatmapStatus(cell.status)}: ${cell.quantity} units, reorder level ${cell.reorder_level}`
                                                                : "No inventory record"
                                                        }
                                                    >
                                                        {cell ? (
                                                            <span className="text-base font-black">
                                                                {cell.quantity}
                                                            </span>
                                                        ) : (
                                                            <span className="text-xs font-bold">-</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </SectionCard>

                <SectionCard
                    icon={<ClipboardList size={21} />}
                    title="Overall Stock Transfer Records"
                    desc="Full transfer reference table for warehouse-to-branch and branch-to-branch stock movements."
                    badge={`${stockTransferRecords.length} records`}
                    badgeTone="blue"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[860px] text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                                <tr className="border-b text-[#6f85a3]">
                                    <th className="py-3">Transfer ID / Transfer Code</th>
                                    <th>Source Branch</th>
                                    <th>Destination Branch</th>
                                    <th className="text-right">Requested Quantity</th>
                                    <th>Status</th>
                                    <th className="text-right">Action</th>
                                </tr>
                            </thead>

                            <tbody>
                                {loading ? (
                                    <EmptyRow colSpan={6} text="Loading stock transfer records..." />
                                ) : paginatedStockTransferRecords.length === 0 ? (
                                    <EmptyRow colSpan={6} text="No stock transfer records found." />
                                ) : (
                                    paginatedStockTransferRecords.map((item) => (
                                        <tr
                                            key={`transfer-record-${item.transfer_id}`}
                                            className="border-b last:border-none hover:bg-[#f8fcff]"
                                        >
                                            <td className="py-4">
                                                <p className="font-extrabold text-[#07102f]">
                                                    {item.transfer_code}
                                                </p>
                                                <p className="text-xs font-semibold text-[#6f85a3]">
                                                    #{item.transfer_id}
                                                </p>
                                            </td>
                                            <td className="font-semibold text-[#17325c]">
                                                <p>{item.source_name}</p>
                                                <p className="text-xs font-bold text-[#6f85a3]">
                                                    {item.source_type === "WAREHOUSE" ? "Warehouse" : "Branch"}
                                                </p>
                                            </td>
                                            <td className="font-semibold text-[#17325c]">
                                                <p>{item.destination_name}</p>
                                                <p className="text-xs font-bold text-[#6f85a3]">
                                                    {item.destination_type === "WAREHOUSE" ? "Warehouse" : "Branch"}
                                                </p>
                                            </td>
                                            <td className="text-right font-extrabold">
                                                {item.requested_quantity ?? 0}
                                            </td>
                                            <td>
                                                <TransferStatusBadge status={item.status} />
                                            </td>
                                            <td className="text-right">
                                                <button
                                                    onClick={() => openTransferDetails(item.transfer_id)}
                                                    disabled={transferDetailLoading === item.transfer_id}
                                                    className="inline-grid h-9 w-9 place-items-center rounded-xl bg-[#eef6fb] text-[#1e4db7] hover:bg-blue-100 disabled:cursor-wait disabled:text-gray-400"
                                                    title="View transfer details"
                                                >
                                                    <Info size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <Pagination
                        total={stockTransferRecords.length}
                        page={transferPage}
                        setPage={setTransferPage}
                    />
                </SectionCard>

                <SectionCard
                    icon={<TrendingUp size={21} />}
                    title="AI Branch Reorder Level Recommendation"
                    desc="What branch reorder level should be maintained based on future demand?"
                    badge={`${aiRecommendations.length} products`}
                    badgeTone="green"
                >
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
                            <thead className="sticky top-0 z-10 bg-white">
                                <tr className="border-b text-[#6f85a3]">
                                    <th className="border-b py-3 pr-5 text-xs font-extrabold uppercase">Product Code</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Product Name</th>
                                    <th className="border-b px-5 text-right text-xs font-extrabold uppercase">Current Branch Reorder</th>
                                    <th className="border-b px-5 text-right text-xs font-extrabold uppercase">AI Recommended Branch Reorder</th>
                                    <th className="border-b px-5 text-xs font-extrabold uppercase">Recommendation</th>
                                    <th className="border-b pl-5 text-right text-xs font-extrabold uppercase">Info</th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <EmptyRow colSpan={6} text="Loading AI reorder recommendations..." />
                                ) : paginatedAi.length === 0 ? (
                                    <EmptyRow colSpan={6} text="No AI reorder recommendation data available." />
                                ) : (
                                    paginatedAi.map((item) => (
                                        <tr
                                            key={`ai-${item.product_id}`}
                                            className="border-b last:border-none hover:bg-[#f8fcff]"
                                        >
                                            <td className="border-b border-blue-50 py-4 pr-5 text-xs font-extrabold uppercase tracking-wide text-[#6f85a3]">
                                                {item.product_code || "-"}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 font-extrabold text-[#07102f]">
                                                {item.product_name || "-"}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 text-right font-extrabold text-[#17325c]">
                                                {item.reorder_level}
                                            </td>
                                            <td className="border-b border-blue-50 px-5 text-right font-extrabold text-green-700">
                                                {item.recommendedReorderLevel}
                                            </td>
                                            <td className="border-b border-blue-50 px-5">
                                                <RecommendationStatusBadge
                                                    recommendation={item.recommendation}
                                                    canApply={
                                                        Number(item.recommendedReorderLevel) !==
                                                        Number(item.reorder_level)
                                                    }
                                                    disabled={
                                                        updatingReorderProductId ===
                                                        Number(item.product_id)
                                                    }
                                                    onApply={() => applyRecommendedReorderLevel(item)}
                                                />
                                            </td>
                                            <td className="border-b border-blue-50 pl-5 text-right">
                                                <button
                                                    onClick={() => setSelectedRecommendation(item)}
                                                    className="inline-grid h-9 w-9 place-items-center rounded-xl bg-[#eef6fb] text-[#1e4db7] hover:bg-blue-100"
                                                    title="View recommendation details"
                                                >
                                                    <Info size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>

                    <Pagination
                        total={aiRecommendations.length}
                        page={aiPage}
                        setPage={setAiPage}
                    />
                </SectionCard>
            </div>

            {selectedProduct && (
                <ProductDistributionModal
                    product={selectedProduct}
                    onClose={() => setSelectedProduct(null)}
                />
            )}

            {selectedTransferDetails && (
                <TransferDetailsModal
                    details={selectedTransferDetails}
                    onClose={() => setSelectedTransferDetails(null)}
                />
            )}

            {arrangeTransferItem && (
                <ArrangeTransferModal
                    item={arrangeTransferItem}
                    sources={arrangeSourceOptions}
                    selectedSource={selectedArrangeSource}
                    form={arrangeTransferForm}
                    setForm={setArrangeTransferForm}
                    loading={arrangingTransfer}
                    onClose={() => setArrangeTransferItem(null)}
                    onSubmit={submitArrangeTransfer}
                />
            )}

            {selectedRecommendation && (
                <RecommendationModal
                    item={selectedRecommendation}
                    onClose={() => setSelectedRecommendation(null)}
                />
            )}

            {toast && (
                <div
                    className={`fixed bottom-6 right-6 z-[60] rounded-2xl px-5 py-4 text-sm font-extrabold shadow-xl ${
                        toast.type === "error"
                            ? "bg-red-500 text-white"
                            : "bg-green-600 text-white"
                    }`}
                >
                    {toast.message}
                </div>
            )}
        </DashboardLayout>
    );
}

async function readArrayResponse(result) {
    if (result.status === "fulfilled" && result.value.ok) {
        const data = await result.value.json();
        return Array.isArray(data) ? data : [];
    }
    return [];
}

function SummaryCard({ title, value, icon, tone }) {
    const tones = {
        blue: "bg-blue-50 text-[#1e4db7]",
        red: "bg-red-50 text-red-700",
        purple: "bg-purple-50 text-purple-700",
        orange: "bg-orange-50 text-orange-700",
        green: "bg-green-50 text-green-700",
    };

    return (
        <div className="flex min-h-[138px] flex-col justify-between rounded-3xl bg-white p-5 shadow">
            <div className="flex items-start justify-between gap-3">
                <p className="max-w-[150px] text-sm font-extrabold leading-snug text-[#6f85a3]">{title}</p>
                <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${tones[tone]}`}>
                    {icon}
                </div>
            </div>
            <h3 className="mt-5 text-4xl font-black leading-none text-[#07102f]">{value}</h3>
        </div>
    );
}

function FilterBar({
    search,
    setSearch,
    branchFilter,
    setBranchFilter,
    stockFilter,
    setStockFilter,
    branchOptions,
}) {
    return (
        <div className="rounded-3xl bg-white p-5 shadow">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                <div className="min-w-0">
                    <h2 className="text-lg font-extrabold text-[#07102f]">
                        Inventory Monitoring Filters
                    </h2>
                    <p className="text-sm text-[#6f85a3]">
                        Search products and filter stock by location or stock status.
                    </p>
                </div>

                <div className="flex w-full flex-col gap-3 md:flex-row xl:w-auto xl:items-center">
                    <div className="relative md:min-w-[280px]">
                        <Search
                            size={16}
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-[#6f85a3]"
                        />
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search product, code, branch..."
                            className="h-11 w-full rounded-2xl border border-blue-100 py-2 pl-10 pr-4 text-sm outline-none transition focus:border-[#1e4db7]"
                        />
                    </div>

                    <select
                        value={branchFilter}
                        onChange={(e) => setBranchFilter(e.target.value)}
                        className="h-11 rounded-2xl border border-blue-100 px-4 text-sm outline-none transition focus:border-[#1e4db7]"
                    >
                        {branchOptions.map((branch) => (
                            <option key={branch} value={branch}>
                                {branch === "ALL"
                                    ? "All Branches"
                                    : branch === "WAREHOUSE"
                                        ? "Warehouse"
                                        : branch}
                            </option>
                        ))}
                    </select>

                    <select
                        value={stockFilter}
                        onChange={(e) => setStockFilter(e.target.value)}
                        className="h-11 rounded-2xl border border-blue-100 px-4 text-sm outline-none transition focus:border-[#1e4db7]"
                    >
                        <option value="ALL">All Status</option>
                        <option value="HEALTHY">Healthy</option>
                        <option value="LOW_STOCK">Low Stock</option>
                        <option value="OUT_OF_STOCK">Out of Stock</option>
                    </select>
                </div>
            </div>
        </div>
    );
}

function SectionCard({ icon, title, desc, badge, badgeTone, children }) {
    const badgeStyles = {
        blue: "bg-blue-50 text-[#1e4db7]",
        red: "bg-red-50 text-red-700",
        purple: "bg-purple-50 text-purple-700",
        orange: "bg-orange-50 text-orange-700",
        green: "bg-green-50 text-green-700",
    };

    return (
        <div className="rounded-3xl bg-white p-5 shadow">
            <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="min-w-0">
                    <h2 className="flex items-center gap-2 text-xl font-extrabold text-[#07102f]">
                        {icon}
                        {title}
                    </h2>
                    <p className="mt-1 text-sm text-[#6f85a3]">{desc}</p>
                </div>

                <span
                    className={`w-fit rounded-full px-4 py-2 text-xs font-extrabold ${
                        badgeStyles[badgeTone] || "bg-gray-50 text-gray-600"
                    }`}
                >
                    {badge}
                </span>
            </div>

            {children}
        </div>
    );
}

function getHeatmapStatus(quantity, reorderLevel) {
    const currentQuantity = Number(quantity || 0);
    const currentReorderLevel = Number(reorderLevel || 0);

    if (currentQuantity === 0) return "OUT_OF_STOCK";
    if (currentQuantity <= currentReorderLevel) return "LOW_STOCK";
    if (currentReorderLevel > 0 && currentQuantity <= currentReorderLevel * 1.5) return "WATCH";
    return "HEALTHY";
}

function getHeatmapCellStyle(status) {
    const styles = {
        OUT_OF_STOCK: "bg-red-50 text-red-800",
        LOW_STOCK: "bg-amber-50 text-amber-800",
        WATCH: "bg-blue-50 text-[#1e4db7]",
        HEALTHY: "bg-emerald-50 text-emerald-800",
    };

    return styles[status] || "bg-slate-50 text-slate-500";
}

function getHeatmapSummaryStyle(status) {
    const styles = {
        OUT_OF_STOCK: "bg-red-50 text-red-800",
        LOW_STOCK: "bg-amber-50 text-amber-800",
        WATCH: "bg-blue-50 text-[#1e4db7]",
        HEALTHY: "bg-emerald-50 text-emerald-800",
    };

    return styles[status] || "bg-slate-50 text-slate-600";
}

function getHeatmapLegendStyle(status) {
    const styles = {
        OUT_OF_STOCK: "bg-red-100 ring-1 ring-red-200",
        LOW_STOCK: "bg-amber-100 ring-1 ring-amber-200",
        WATCH: "bg-blue-100 ring-1 ring-blue-200",
        HEALTHY: "bg-emerald-100 ring-1 ring-emerald-200",
    };

    return styles[status] || "bg-slate-300";
}

function formatHeatmapStatus(status) {
    const labels = {
        OUT_OF_STOCK: "Out of Stock",
        LOW_STOCK: "Low Stock",
        WATCH: "Watch",
        HEALTHY: "Healthy",
    };

    return labels[status] || formatStatus(status);
}

function getHeatmapLegendText(status) {
    const labels = {
        OUT_OF_STOCK: "Red: 0 stock",
        LOW_STOCK: "Amber: at or below reorder level",
        WATCH: "Blue: near reorder level",
        HEALTHY: "Light green: above reorder level",
    };

    return labels[status] || formatHeatmapStatus(status);
}

function sortLocations(a, b) {
    if (a.branch_type === b.branch_type) {
        return a.branch_name.localeCompare(b.branch_name);
    }

    return a.branch_type === "WAREHOUSE" ? -1 : 1;
}

function StockStatusBadge({ status }) {
    const styles = {
        HEALTHY: "bg-green-50 text-green-700",
        LOW_STOCK: "bg-yellow-50 text-yellow-700",
        OUT_OF_STOCK: "bg-red-50 text-red-700",
    };
    const labels = {
        HEALTHY: "Healthy",
        LOW_STOCK: "Low Stock",
        OUT_OF_STOCK: "Out of Stock",
    };

    return (
        <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${
                styles[status] || "bg-gray-50 text-gray-600"
            }`}
        >
            {labels[status] || status || "-"}
        </span>
    );
}

function TransferStatusBadge({ status }) {
    const styles = {
        PENDING: "bg-orange-50 text-orange-700",
        PENDING_SOURCE: "bg-purple-50 text-purple-700",
        APPROVED: "bg-blue-50 text-[#1e4db7]",
        REJECTED: "bg-red-50 text-red-700",
        RECEIVED: "bg-green-50 text-green-700",
    };

    return (
        <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${
                styles[status] || "bg-gray-50 text-gray-600"
            }`}
        >
            {formatStatus(status)}
        </span>
    );
}

function RecommendationStatusBadge({ recommendation, canApply = false, disabled = false, onApply }) {
    const styles = {
        "Increase Reorder Level": "bg-green-50 text-green-700",
        "Decrease Reorder Level": "bg-orange-50 text-orange-700",
        "Keep Current Level": "bg-blue-50 text-[#1e4db7]",
    };
    const hoverStyles = {
        "Increase Reorder Level": "hover:bg-green-100",
        "Decrease Reorder Level": "hover:bg-orange-100",
        "Keep Current Level": "hover:bg-blue-100",
    };

    if (canApply) {
        return (
            <button
                type="button"
                onClick={onApply}
                disabled={disabled}
                className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold transition disabled:cursor-wait disabled:opacity-60 ${
                    styles[recommendation] || "bg-gray-50 text-gray-600"
                } ${hoverStyles[recommendation] || "hover:bg-gray-100"}`}
                title="Update current reorder level to the AI recommended level"
            >
                {disabled ? "Updating..." : recommendation}
            </button>
        );
    }

    return (
        <span
            className={`inline-flex rounded-full px-3 py-1 text-xs font-extrabold ${
                styles[recommendation] || "bg-gray-50 text-gray-600"
            }`}
        >
            {recommendation}
        </span>
    );
}

function ProductDistributionModal({ product, onClose }) {
    const sortedLocations = [...product.locations].sort((a, b) => {
        if (a.branch_type === b.branch_type) {
            return a.branch_name.localeCompare(b.branch_name);
        }
        return a.branch_type === "WAREHOUSE" ? -1 : 1;
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="custom-scrollbar max-h-[90vh] w-full max-w-[720px] overflow-y-auto rounded-3xl bg-white shadow-2xl">
                <ModalHeader
                    icon={<PackageSearch size={25} />}
                    title="Product Stock Distribution"
                    subtitle={product.product_name}
                    onClose={onClose}
                />

                <div className="space-y-5 p-7">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <InfoRow label="Product Code" value={product.product_code || "-"} />
                        <InfoRow label="Category" value={product.category_name || "-"} />
                        <InfoRow label="Total Stock" value={`${product.totalStock} units`} />
                        <InfoRow label="Reorder Level" value={`${product.reorder_level} units`} />
                    </div>

                    <div className="rounded-2xl bg-[#f8fcff] p-5">
                        <h3 className="mb-4 text-lg font-extrabold text-[#07102f]">
                            Stock by Location
                        </h3>
                        <div className="space-y-3">
                            {sortedLocations.map((location) => (
                                <div
                                    key={`${location.branch_name}-${location.branch_type}`}
                                    className="flex items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-sm"
                                >
                                    <div>
                                        <p className="font-extrabold text-[#07102f]">
                                            {location.branch_name}
                                        </p>
                                        <p className="text-xs font-bold uppercase text-[#6f85a3]">
                                            {location.branch_type === "WAREHOUSE" ? "Warehouse" : "Branch"}
                                        </p>
                                    </div>
                                    <p className="text-right text-lg font-black text-[#17325c]">
                                        {location.quantity} units
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={onClose}
                            className="rounded-2xl bg-[#0c2f73] px-6 py-3 text-sm font-extrabold text-white hover:bg-[#103986]"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ArrangeTransferModal({
    item,
    sources,
    selectedSource,
    form,
    setForm,
    loading,
    onClose,
    onSubmit,
}) {
    const quantity = Number(form.quantity || 0);
    const sourceStock = Number(selectedSource?.quantity_in_stock || 0);
    const overSourceStock = selectedSource && quantity > sourceStock;
    const sourceTypeLabel = selectedSource?.branch_type === "WAREHOUSE" ? "Warehouse" : "Branch";

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="custom-scrollbar max-h-[90vh] w-full max-w-[720px] overflow-y-auto rounded-3xl bg-white shadow-2xl">
                <ModalHeader
                    icon={<PackagePlus size={25} />}
                    title="Arrange Stock Transfer"
                    subtitle={`${item.product_name} for ${item.branch_name}`}
                    onClose={onClose}
                />

                <div className="space-y-5 p-7">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <InfoRow label="Destination Branch" value={item.branch_name || "-"} />
                        <InfoRow label="Current Quantity" value={`${item.quantity_in_stock ?? 0} units`} />
                        <InfoRow label="Reorder Level" value={`${item.reorder_level ?? 0} units`} />
                        <InfoRow label="Status" value={<StockStatusBadge status={item.stock_status} />} />
                    </div>

                    <label className="block">
                        <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                            Source Location
                        </span>
                        <select
                            value={form.source_branch_id}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    source_branch_id: event.target.value,
                                }))
                            }
                            className="h-12 w-full rounded-2xl border border-blue-100 px-4 text-sm font-semibold text-[#17325c] outline-none focus:border-[#1e4db7]"
                        >
                            <option value="">Select source with available stock</option>
                            {sources.map((source) => (
                                <option key={source.branch_id} value={source.branch_id}>
                                    {source.branch_name} ({source.branch_type === "WAREHOUSE" ? "Warehouse" : "Branch"}) - Stock: {source.quantity_in_stock}
                                </option>
                            ))}
                        </select>
                        {sources.length === 0 && (
                            <p className="mt-2 text-sm font-bold text-red-600">
                                No warehouse or branch has available stock for this product.
                            </p>
                        )}
                    </label>

                    <label className="block">
                        <span className="mb-2 block text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                            Transfer Quantity
                        </span>
                        <input
                            type="number"
                            min="1"
                            max={selectedSource ? sourceStock : undefined}
                            value={form.quantity}
                            onChange={(event) =>
                                setForm((current) => ({
                                    ...current,
                                    quantity: event.target.value,
                                }))
                            }
                            className={`h-12 w-full rounded-2xl border px-4 text-sm font-semibold text-[#17325c] outline-none focus:border-[#1e4db7] ${
                                overSourceStock ? "border-red-200 bg-red-50/40" : "border-blue-100"
                            }`}
                        />
                        {overSourceStock && (
                            <p className="mt-2 text-sm font-bold text-red-600">
                                Quantity cannot exceed selected source stock.
                            </p>
                        )}
                    </label>

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <InfoRow label="Selected Source" value={selectedSource?.branch_name || "-"} />
                        <InfoRow label="Source Type" value={selectedSource ? sourceTypeLabel : "-"} />
                        <InfoRow label="Source Stock" value={selectedSource ? `${sourceStock} units` : "-"} />
                        <InfoRow
                            label="Source After Transfer"
                            value={selectedSource && quantity ? `${Math.max(sourceStock - quantity, 0)} units` : "-"}
                        />
                    </div>

                    <div className="rounded-2xl bg-[#f8fcff] p-4 text-sm font-semibold text-[#6f85a3]">
                        Warehouse source creates an approved transfer for branch receiving. Branch source sends the request to that source manager for approval.
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={loading}
                            className="rounded-2xl bg-[#eef6fb] py-4 font-extrabold text-[#17325c] hover:bg-blue-100 disabled:opacity-60"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={onSubmit}
                            disabled={loading || !selectedSource || !quantity || quantity <= 0 || overSourceStock}
                            className="rounded-2xl bg-[#0c2f73] py-4 font-extrabold text-white hover:bg-[#103986] disabled:cursor-not-allowed disabled:bg-gray-300"
                        >
                            {loading ? "Arranging..." : "Arrange Transfer"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function RecommendationModal({ item, onClose }) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="custom-scrollbar max-h-[90vh] w-full max-w-[720px] overflow-y-auto rounded-3xl bg-white shadow-2xl">
                <ModalHeader
                    icon={<TrendingUp size={25} />}
                    title="AI Branch Reorder Level Recommendation"
                    subtitle={item.product_name}
                    onClose={onClose}
                />

                <div className="space-y-5 p-7">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <InfoRow label="Product" value={item.product_name || "-"} />
                        <InfoRow label="Product Code" value={item.product_code || "-"} />
                        <InfoRow label="Current Branch Reorder" value={`${item.reorder_level} units`} />
                        <InfoRow label="Warehouse Reorder" value={`${item.warehouse_reorder_level} units`} />
                        <InfoRow label="AI Recommended Branch Reorder" value={`${item.recommendedReorderLevel} units`} />
                        <InfoRow label="Branch Count Used" value={`${item.branchCount} branches`} />
                        <InfoRow
                            label="Forecasted Total Monthly Demand"
                            value={item.forecastDemand > 0 ? `${item.forecastDemand} units` : "-"}
                        />
                        <InfoRow
                            label="Estimated Demand Per Branch"
                            value={item.branchForecastDemand > 0 ? `${formatCompactNumber(item.branchForecastDemand)} units` : "-"}
                        />
                        <InfoRow label="Recommendation" value={item.recommendation} />
                    </div>

                    <div className="rounded-2xl bg-[#f8fcff] p-5">
                        <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                            Reason
                        </p>
                        <p className="mt-2 text-sm font-extrabold leading-6 text-[#17325c]">
                            {item.reason}
                        </p>
                    </div>

                    <div className="rounded-2xl bg-[#f8fcff] p-5">
                        <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                            Recent Sales Movement
                        </p>
                        {item.recentSales?.length > 0 ? (
                            <div className="mt-3 space-y-2">
                                {item.recentSales.map((sale) => (
                                    <div
                                        key={sale.month}
                                        className="flex items-center justify-between rounded-xl bg-white px-4 py-3 text-sm font-extrabold text-[#17325c]"
                                    >
                                        <span>{formatMonthLabel(sale.month)}</span>
                                        <span>{sale.quantity} units sold</span>
                                    </div>
                                ))}
                                <p className="pt-1 text-xs font-bold text-[#6f85a3]">
                                    Total: {item.recentSalesStats.total} units across {item.recentSalesStats.monthCount} recent recorded months.
                                </p>
                            </div>
                        ) : (
                            <p className="mt-2 text-sm font-extrabold text-[#17325c]">
                                No recent monthly sales records are available for this product.
                            </p>
                        )}
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={onClose}
                            className="rounded-2xl bg-[#0c2f73] px-6 py-3 text-sm font-extrabold text-white hover:bg-[#103986]"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function TransferDetailsModal({ details, onClose }) {
    const transfer = Array.isArray(details) ? details[0] || {} : details || {};
    const items = Array.isArray(details)
        ? details
        : Array.isArray(details?.details)
            ? details.details
            : [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
            <div className="custom-scrollbar max-h-[92vh] w-full max-w-[1000px] overflow-y-auto rounded-3xl bg-white shadow-2xl">
                <ModalHeader
                    icon={<PackageSearch size={25} />}
                    title="Transfer Details"
                    subtitle={transfer.transfer_code || `#${transfer.transfer_id || "-"}`}
                    onClose={onClose}
                />

                <div className="space-y-6 p-7">
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
                        <InfoGroup title="Transfer Info">
                            <InfoRow label="Transfer ID" value={transfer.transfer_code || transfer.transfer_id || "-"} />
                            <InfoRow label="Source Branch" value={transfer.source_name || transfer.source_branch || "-"} />
                            <InfoRow label="Destination Branch" value={transfer.destination_name || transfer.destination_branch || "-"} />
                        </InfoGroup>

                        <InfoGroup title="Approval">
                            <InfoRow label="Transfer Status" value={<TransferStatusBadge status={transfer.status} />} />
                            <InfoRow label="Request Date" value={formatDateTime(transfer.request_date || transfer.created_at || transfer.transfer_date)} />
                            <InfoRow label="Approval Date" value={formatDateTime(transfer.approval_date || transfer.approved_at)} />
                        </InfoGroup>

                        <InfoGroup title="People">
                            <InfoRow label="Approved By" value={transfer.approved_by || "-"} />
                            <InfoRow label="Requested By" value={transfer.requested_by || "-"} />
                            <InfoRow label="Quantity" value={`${transfer.requested_quantity ?? transfer.quantity ?? totalTransferQuantity(items)} units`} />
                        </InfoGroup>
                    </div>

                    <StockTransferTimeline transfer={transfer} formatDateTime={formatDateTime} />

                    <div className="rounded-2xl bg-[#f8fcff] p-5">
                        <h3 className="mb-4 text-lg font-extrabold text-[#07102f]">
                            Product Details
                        </h3>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[940px] border-separate border-spacing-0 text-left text-sm">
                                <thead className="bg-[#f8fcff] text-[#6f85a3]">
                                    <tr>
                                        <th className="border-b py-3 pr-4 text-xs font-extrabold uppercase">Product Name</th>
                                        <th className="border-b px-4 text-xs font-extrabold uppercase">Product Code</th>
                                        <th className="border-b px-4 text-right text-xs font-extrabold uppercase">Transfer Quantity</th>
                                        <th className="border-b px-4 text-right text-xs font-extrabold uppercase">Source Before</th>
                                        <th className="border-b px-4 text-right text-xs font-extrabold uppercase">Source After</th>
                                        <th className="border-b px-4 text-right text-xs font-extrabold uppercase">Destination Before</th>
                                        <th className="border-b pl-4 text-right text-xs font-extrabold uppercase">Destination After</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {items.length === 0 ? (
                                        <EmptyRow colSpan={7} text="No transfer detail items found." />
                                    ) : (
                                        items.map((item, index) => (
                                            <tr
                                                key={item.transfer_detail_id || index}
                                                className="bg-white hover:bg-[#f8fcff]"
                                            >
                                                <td className="border-b border-blue-50 py-4 pr-4 font-extrabold text-[#07102f]">
                                                    {item.product_name || "-"}
                                                </td>
                                                <td className="border-b border-blue-50 px-4 text-xs font-extrabold uppercase text-[#6f85a3]">
                                                    {item.product_code || "-"}
                                                </td>
                                                <td className="border-b border-blue-50 px-4 text-right font-extrabold">
                                                    {item.quantity ?? item.requested_quantity ?? "-"}
                                                </td>
                                                <td className="border-b border-blue-50 px-4 text-right font-bold">
                                                    {formatStockSnapshot(item.source_stock_before)}
                                                </td>
                                                <td className="border-b border-blue-50 px-4 text-right font-bold">
                                                    {formatStockSnapshot(item.source_stock_after)}
                                                </td>
                                                <td className="border-b border-blue-50 px-4 text-right font-bold">
                                                    {formatStockSnapshot(item.destination_stock_before)}
                                                </td>
                                                <td className="border-b border-blue-50 pl-4 text-right font-bold">
                                                    {formatStockSnapshot(item.destination_stock_after)}
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={onClose}
                            className="rounded-2xl bg-[#0c2f73] px-6 py-3 text-sm font-extrabold text-white hover:bg-[#103986]"
                        >
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function ModalHeader({ icon, title, subtitle, onClose }) {
    return (
        <div className="flex items-start justify-between gap-4 rounded-t-3xl bg-[#e9f7ff] px-7 py-6">
            <div className="flex items-center gap-4">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#001f55] text-white">
                    {icon}
                </div>
                <div>
                    <h2 className="text-xl font-extrabold text-[#07102f]">
                        {title}
                    </h2>
                    <p className="text-sm font-bold text-[#17325c]">
                        {subtitle}
                    </p>
                </div>
            </div>

            <button
                onClick={onClose}
                className="grid h-10 w-10 place-items-center rounded-xl text-[#6f85a3] hover:bg-white"
            >
                <X size={22} />
            </button>
        </div>
    );
}

function InfoGroup({ title, children }) {
    return (
        <div className="rounded-2xl border border-blue-50 bg-white p-4 shadow-sm">
            <h3 className="mb-3 text-sm font-extrabold uppercase text-[#6f85a3]">
                {title}
            </h3>
            <div className="space-y-3">{children}</div>
        </div>
    );
}

function InfoRow({ label, value }) {
    return (
        <div className="rounded-2xl bg-[#f8fcff] p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-[#6f85a3]">
                {label}
            </p>
            <div className="mt-2 font-extrabold text-[#17325c]">
                {value || "-"}
            </div>
        </div>
    );
}

function Pagination({ total, page, setPage }) {
    const totalPages = Math.ceil(total / ROWS_PER_PAGE);

    if (totalPages <= 1) return null;

    return (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
            <button
                disabled={page === 1}
                onClick={() => setPage((prev) => Math.max(prev - 1, 1))}
                className="rounded-xl border border-blue-100 px-3 py-2 text-xs font-extrabold text-[#1e4db7] hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300"
            >
                Previous
            </button>

            {Array.from({ length: totalPages }, (_, index) => index + 1).map((p) => (
                <button
                    key={p}
                    onClick={() => setPage(p)}
                    className={`grid h-9 w-9 place-items-center rounded-xl text-xs font-extrabold ${
                        p === page
                            ? "bg-[#0c2f73] text-white"
                            : "border border-blue-100 text-[#1e4db7] hover:bg-blue-50"
                    }`}
                >
                    {p}
                </button>
            ))}

            <button
                disabled={page === totalPages}
                onClick={() => setPage((prev) => Math.min(prev + 1, totalPages))}
                className="rounded-xl border border-blue-100 px-3 py-2 text-xs font-extrabold text-[#1e4db7] hover:bg-blue-50 disabled:cursor-not-allowed disabled:text-gray-300"
            >
                Next
            </button>
        </div>
    );
}

function EmptyRow({ colSpan, text }) {
    return (
        <tr>
            <td colSpan={colSpan} className="py-8 text-center text-[#6f85a3]">
                {text}
            </td>
        </tr>
    );
}

function paginate(items, page) {
    const start = (page - 1) * ROWS_PER_PAGE;
    return items.slice(start, start + ROWS_PER_PAGE);
}

function hasOpenTransferRequest(item) {
    if (!item) return false;
    if (item.has_active_transfer) return true;
    return ACTIVE_TRANSFER_STATUSES.includes(item.active_transfer_status);
}

function getReorderRecommendation(current, recommended) {
    if (Number(recommended) > Number(current)) return "Increase Reorder Level";
    if (Number(recommended) < Number(current)) return "Decrease Reorder Level";
    return "Keep Current Level";
}

function getRecentMonthlySales(monthlySales = [], limit = 3) {
    if (!Array.isArray(monthlySales)) return [];

    return monthlySales
        .filter((item) => item?.month)
        .map((item) => ({
            month: item.month,
            quantity: Number(item.quantity || 0),
        }))
        .sort((a, b) => String(a.month).localeCompare(String(b.month)))
        .slice(-limit);
}

function getRecentSalesStats(recentSales) {
    const total = recentSales.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const monthCount = recentSales.length;
    const average = monthCount > 0 ? total / monthCount : 0;

    return {
        total,
        monthCount,
        average,
    };
}

function buildReorderReason({
    currentLevel,
    recommendedLevel,
    forecastDemand,
    branchForecastDemand,
    branchCount,
    recommendation,
    recentSalesStats,
}) {
    const current = Number(currentLevel || 0);
    const recommended = Number(recommendedLevel || 0);
    const demand = Number(forecastDemand || 0);
    const perBranchDemand = Number(branchForecastDemand || 0);
    const branches = Math.max(1, Number(branchCount || 1));
    const monthCount = Number(recentSalesStats?.monthCount || 0);
    const total = Number(recentSalesStats?.total || 0);
    const average = Number(recentSalesStats?.average || 0);
    const demandSummary =
        demand > 0
            ? ` Forecasted total monthly demand is ${demand} units across ${branches} branch${branches === 1 ? "" : "es"}, so estimated demand per branch is ${formatCompactNumber(perBranchDemand)} units.`
            : " Forecast demand is not currently available, so the existing branch reorder level is used.";
    const salesSummary =
        monthCount > 0
            ? ` Recent sales show ${total} units sold across the last ${monthCount} recorded month${monthCount === 1 ? "" : "s"}, averaging ${formatCompactNumber(average)} units per month.`
            : " Recent monthly sales history is not available for this product.";

    if (recommendation === "Decrease Reorder Level") {
        return `Decrease is recommended because the estimated branch demand is lower than the current branch reorder level of ${current} units. The suggested branch level of ${recommended} units keeps a safety buffer while reducing excess inventory risk.${demandSummary}${salesSummary}`;
    }

    if (recommendation === "Increase Reorder Level") {
        return `Increase is recommended because the estimated branch demand is higher than the current branch reorder level of ${current} units. The suggested branch level of ${recommended} units adds safety stock for expected demand.${demandSummary}${salesSummary}`;
    }

    if (demand > 0) {
        return `The current branch reorder level is aligned with estimated branch demand, so no change is recommended.${demandSummary}${salesSummary}`;
    }

    return `No forecast demand is currently available, so the current branch reorder level is maintained.${salesSummary}`;
}

function formatCompactNumber(value) {
    const number = Number(value || 0);
    return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function formatMonthLabel(value) {
    if (!value) return "-";
    const date = new Date(`${value}-01T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString(undefined, { month: "short", year: "numeric" });
}

function totalTransferQuantity(items) {
    return items.reduce((sum, item) => sum + Number(item.quantity || item.requested_quantity || 0), 0);
}

function formatStatus(status) {
    if (!status) return "-";
    return String(status)
        .toLowerCase()
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function formatDateTime(dateValue) {
    if (!dateValue) return "-";

    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "-";

    return date.toLocaleString();
}

function formatStockSnapshot(value) {
    return value === null || value === undefined ? "-" : `${value} units`;
}
