"""Database-friendly custom types."""
from geoalchemy2 import Geography
from sqlalchemy import JSON, Text, Uuid
from sqlalchemy.types import TypeDecorator


class GeographyOrText(TypeDecorator):
    """Use PostGIS geography in PostgreSQL and plain text elsewhere."""

    impl = Text
    cache_ok = True

    def __init__(self, geometry_type: str = "POINT", srid: int = 4326):
        super().__init__()
        self.geometry_type = geometry_type
        self.srid = srid

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(
                Geography(geometry_type=self.geometry_type, srid=self.srid)
            )
        return dialect.type_descriptor(Text())


UUIDType = Uuid(as_uuid=True)
JSONType = JSON
