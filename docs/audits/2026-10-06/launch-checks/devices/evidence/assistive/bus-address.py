import os,dbus,dbus.service
from dbus.mainloop.glib import DBusGMainLoop
from gi.repository import GLib
DBusGMainLoop(set_as_default=True)
bus=dbus.SessionBus()
name=dbus.service.BusName('org.a11y.Bus',bus)
class Address(dbus.service.Object):
 @dbus.service.method('org.a11y.Bus',in_signature='',out_signature='s')
 def GetAddress(self):return os.environ['AT_SPI_BUS_ADDRESS']
 @dbus.service.method('org.freedesktop.DBus.Properties',in_signature='ss',out_signature='v')
 def Get(self,interface,prop):return dbus.Boolean(True)
 @dbus.service.method('org.freedesktop.DBus.Properties',in_signature='s',out_signature='a{sv}')
 def GetAll(self,interface):return {'IsEnabled':dbus.Boolean(True),'ScreenReaderEnabled':dbus.Boolean(True)}
 @dbus.service.method('org.freedesktop.DBus.Properties',in_signature='ssv',out_signature='')
 def Set(self,interface,prop,value):pass
Address(bus,'/org/a11y/bus')
GLib.MainLoop().run()
