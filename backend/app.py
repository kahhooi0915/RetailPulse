from flask import Flask, send_from_directory
from flask_cors import CORS
import os

from config import Config
from routes.auth_routes import auth_bp
from routes.user_routes import user_bp
from routes.branch_routes import branch_bp
from routes.category_routes import category_bp
from routes.product_routes import product_bp
from routes.inventory_routes import inventory_bp
from routes.sales_routes import sales_bp
from routes.stock_transfer_routes import stock_transfer_bp
from routes.forecast_routes import forecast_bp
from routes.purchase_routes import purchase_bp
from routes.forgot_password_routes import forgot_password_bp
from routes.dashboard_routes import dashboard_bp
from routes.audit_routes import audit_bp
from routes.ai_routes import ai_bp
from routes.backup_routes import backup_bp

def create_app():
    app = Flask(__name__)
    CORS(app, origins=Config.CORS_ORIGINS)

    @app.route("/")
    def home():
        return "Backend is running"

    @app.route('/images/products/<path:filename>')
    def serve_product_image(filename):
        folder = os.path.join(app.root_path, 'static', 'images', 'products')
        return send_from_directory(folder, filename)

    app.register_blueprint(auth_bp)
    app.register_blueprint(user_bp)
    app.register_blueprint(branch_bp)
    app.register_blueprint(category_bp)
    app.register_blueprint(product_bp)
    app.register_blueprint(inventory_bp)
    app.register_blueprint(sales_bp)
    app.register_blueprint(stock_transfer_bp)
    app.register_blueprint(forecast_bp)
    app.register_blueprint(purchase_bp)
    app.register_blueprint(forgot_password_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(audit_bp)
    app.register_blueprint(ai_bp)
    app.register_blueprint(backup_bp)
    
    return app


app = create_app()

if __name__ == "__main__":
    app.run(debug=Config.FLASK_DEBUG)
